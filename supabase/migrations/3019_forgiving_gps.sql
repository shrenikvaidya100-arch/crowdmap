-- GPS made forgiving (owner's request):
-- * any GPS fix counts: no "low accuracy" or "jumping location" refusals; a place
--   accepts you within its radius plus up to 200 m of GPS error.
-- * reporting from somewhere that isn't the place you picked counts for the nearest
--   listed place within 1 km instead of being refused.
-- (Impossible travel and the hourly limit still apply.)

create or replace function public.check_location(
  p_user uuid, p_lat double precision, p_lng double precision, p_accuracy real,
  p_spread real, p_place uuid, p_max_distance real, p_source text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  pt extensions.geography := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;
  prev public.location_checks;
  dist real;
  speed real;
  reason text;
  allowed real;
begin
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    reason := 'bad_location';
  elsif (select count(*) from public.location_checks
         where user_id = p_user and at > now() - interval '1 hour') >= 30 then
    reason := 'rate_limited';
  end if;

  if p_place is not null then
    select extensions.st_distance(location, pt), radius_m + least(coalesce(p_accuracy, 0), 200)
      into dist, allowed from public.places where id = p_place and status <> 'removed';
    if dist is null then reason := coalesce(reason, 'unknown_place');
    elsif dist > allowed then reason := coalesce(reason, 'not_at_place');
    end if;
  elsif p_max_distance is not null then
    allowed := p_max_distance;
  end if;

  select * into prev from public.location_checks
    where user_id = p_user and at > now() - interval '2 hours' order by at desc limit 1;
  if found then
    declare
      km real := extensions.st_distance(
        extensions.st_setsrid(extensions.st_makepoint(prev.lng, prev.lat), 4326)::extensions.geography, pt) / 1000;
      hours real := greatest(extract(epoch from now() - prev.at) / 3600, 1.0 / 3600);
    begin
      speed := km / hours;
      if km > 2 and speed > 200 then reason := coalesce(reason, 'impossible_travel'); end if;
    end;
  end if;

  insert into public.location_checks (user_id, lat, lng, accuracy_m, spread_m, place_id, distance_m, speed_kmh, source, accepted, reason)
  values (p_user, p_lat, p_lng, coalesce(p_accuracy, -1), p_spread, p_place, dist, speed, p_source, reason is null, reason);

  return jsonb_build_object('ok', reason is null, 'reason', reason, 'distance_m', round(dist::numeric, 1));
end $$;

create or replace function public.submit_crowd_report(
  p_place uuid, p_level int, p_lat double precision, p_lng double precision,
  p_accuracy real, p_spread real default 0
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_active_user();
  chk jsonb;
  new_id uuid;
  moved uuid;
begin
  if p_level not between 1 and 5 then raise exception 'level must be 1-5'; end if;
  if exists (select 1 from public.crowd_reports
             where user_id = uid and place_id = p_place and created_at > now() - interval '10 minutes') then
    return jsonb_build_object('ok', false, 'reason', 'too_soon');
  end if;

  chk := public.check_location(uid, p_lat, p_lng, p_accuracy, p_spread, p_place, null, 'crowd_report');
  -- Not at the place picked: count the report for the nearest listed place you ARE at
  -- (within 1 km) instead of refusing it.
  if chk ->> 'reason' = 'not_at_place' then
    select p.id into moved from public.places p
    where p.status = 'listed' and extensions.st_dwithin(p.location,
          extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography, 1000)
    order by extensions.st_distance(p.location, extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography), p.radius_m desc
    limit 1;
    if moved is not null then
      p_place := moved;
      chk := jsonb_build_object('ok', true, 'distance_m', round(extensions.st_distance(
        (select location from public.places where id = moved),
        extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography)::numeric, 1));
      if exists (select 1 from public.crowd_reports
                 where user_id = uid and place_id = p_place and created_at > now() - interval '10 minutes') then
        return jsonb_build_object('ok', false, 'reason', 'too_soon');
      end if;
    end if;
  end if;
  if not (chk ->> 'ok')::boolean then
    perform public.log_event_as(uid, 'user', 'crowd.report_rejected', 'place', p_place::text,
      jsonb_build_object('reason', chk ->> 'reason', 'level', p_level));
    return chk;
  end if;

  insert into public.crowd_reports (place_id, user_id, level, lat, lng, accuracy_m, distance_m)
  values (p_place, uid, p_level, p_lat, p_lng, p_accuracy, (chk ->> 'distance_m')::real)
  returning id into new_id;
  perform public.log_event_as(uid, 'user', 'crowd.report', 'place', p_place::text,
    jsonb_build_object('report_id', new_id, 'level', p_level, 'distance_m', chk -> 'distance_m'));
  return jsonb_build_object('ok', true, 'id', new_id, 'place_id', p_place, 'moved', moved is not null,
    'place_name', (select name from public.places where id = p_place));
end $$;

-- Sharing location: any fix counts; outside every place, the nearest listed place within 300 m.
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
  -- Any GPS fix counts (rough fixes just widen the match below).

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
  where p.status <> 'removed' and extensions.st_dwithin(p.location, pt, p.radius_m + least(coalesce(p_accuracy, 0), 200))
  order by extensions.st_distance(p.location, pt), p.radius_m desc limit 1;
  -- Not inside any place: count you at the nearest listed place within 300 m.
  if here.id is null then
    select p.* into here from public.places p
    where p.status = 'listed' and extensions.st_dwithin(p.location, pt, 300)
    order by extensions.st_distance(p.location, pt), p.radius_m desc limit 1;
  end if;

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
