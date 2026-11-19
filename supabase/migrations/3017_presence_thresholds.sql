-- People in the same spot push the crowd level up on their own, sooner:
-- * presence_floor: classrooms/cafés/messes ("other", cafe, restaurant, bank) need 3
--   people sharing location per step (3 = Moderate, 6 = Busy, 9+ = Packed); parks,
--   stations, malls, hospitals and teaching blocks 6; everything else 4.
-- * heartbeat: when two places sit on the same spot (D-303 inside D-Block), the one
--   covering the larger area counts the people, instead of an arbitrary pick.

create or replace function public.presence_floor(p_category text, p_here int) returns int
language sql immutable set search_path = '' as $$
  with k as (select case
    when p_category in ('cafe', 'restaurant', 'bank', 'other', 'hostel') then 3
    when p_category in ('park', 'station', 'mall', 'hospital', 'education') then 6
    else 4 end as per_level)
  select case when p_here >= (select per_level from k)
              then least(5, 2 + p_here / (select per_level from k))::int
              else null end;
$$;

create or replace function public.heartbeat(p_lat double precision, p_lng double precision, p_accuracy real) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_active_user();
  prev public.presence;
  pt extensions.geography := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;
  here public.places;
  city text;
  km real;
  hours real;
begin
  if p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    return jsonb_build_object('ok', false, 'reason', 'bad_location');
  end if;
  if p_accuracy is null or p_accuracy > 100 then
    return jsonb_build_object('ok', false, 'reason', 'low_accuracy');
  end if;

  select * into prev from public.presence where user_id = uid;
  if found then
    if prev.updated_at > now() - interval '30 seconds' then
      return jsonb_build_object('ok', true, 'throttled', true, 'place_id', prev.place_id);
    end if;
    km := extensions.st_distance(extensions.st_setsrid(extensions.st_makepoint(prev.lng, prev.lat), 4326)::extensions.geography, pt) / 1000;
    hours := greatest(extract(epoch from now() - prev.updated_at) / 3600, 1.0 / 3600);
    if km > 2 and km / hours > 200 and prev.updated_at > now() - interval '2 hours' then
      insert into public.location_checks (user_id, lat, lng, accuracy_m, speed_kmh, source, accepted, reason)
      values (uid, p_lat, p_lng, p_accuracy, km / hours, 'presence', false, 'impossible_travel');
      return jsonb_build_object('ok', false, 'reason', 'impossible_travel');
    end if;
  end if;

  -- The nearest place whose radius you are inside.
  select p.* into here from public.places p
  where p.status <> 'removed' and extensions.st_dwithin(p.location, pt, p.radius_m + least(p_accuracy, 50))
  order by extensions.st_distance(p.location, pt), p.radius_m desc limit 1;

  select c.id into city from public.cities c
  where extensions.st_dwithin(extensions.st_setsrid(extensions.st_makepoint(c.lng, c.lat), 4326)::extensions.geography, pt, 40000)
  order by extensions.st_distance(extensions.st_setsrid(extensions.st_makepoint(c.lng, c.lat), 4326)::extensions.geography, pt)
  limit 1;

  insert into public.presence (user_id, lat, lng, accuracy_m, place_id, city_id, updated_at)
  values (uid, p_lat, p_lng, p_accuracy, here.id, city, now())
  on conflict (user_id) do update set lat = excluded.lat, lng = excluded.lng, accuracy_m = excluded.accuracy_m,
    place_id = excluded.place_id, city_id = excluded.city_id, updated_at = now();

  if here.id is not null then
    insert into public.presence_hourly (place_id, hour, peak)
    values (here.id, date_trunc('hour', now()), public.here_now(here.id))
    on conflict (place_id, hour) do update set peak = greatest(public.presence_hourly.peak, excluded.peak);
  end if;

  -- Tell viewers when someone arrives at or leaves a place.
  if here.id is distinct from prev.place_id then
    if prev.place_id is not null then perform public.notify_city(prev.city_id, prev.place_id, 'presence'); end if;
    if here.id is not null then perform public.notify_city(city, here.id, 'presence'); end if;
  end if;

  -- Housekeeping: raw positions are kept for at most an hour.
  delete from public.presence where updated_at < now() - interval '1 hour';

  return jsonb_build_object('ok', true, 'place_id', here.id, 'place_name', here.name, 'here', coalesce(public.here_now(here.id), 0));
end $$;
