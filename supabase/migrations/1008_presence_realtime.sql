-- User 1: live presence ("share my location while the app is open") and
-- instant map updates over Supabase Realtime.
--
-- Privacy: one row per user holds only their latest position; it stops counting
-- after 10 minutes and is deleted after 1 hour. Long term we keep only counts
-- per place per hour (presence_hourly), never who or where.

-- ---------------------------------------------------------------------------
-- Presence
-- ---------------------------------------------------------------------------
create table public.presence (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  lat        double precision not null,
  lng        double precision not null,
  accuracy_m real not null,
  place_id   uuid references public.places(id) on delete set null,
  city_id    text references public.cities(id),
  updated_at timestamptz not null default now()
);
create index presence_place_idx on public.presence (place_id, updated_at);

alter table public.presence enable row level security;
revoke all on public.presence from anon, authenticated;
grant select, delete on public.presence to authenticated;
create policy presence_own on public.presence for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy presence_delete_own on public.presence for delete to authenticated
  using (user_id = auth.uid());

create table public.presence_hourly (
  place_id uuid not null references public.places(id) on delete cascade,
  hour     timestamptz not null,
  peak     int not null,
  primary key (place_id, hour)
);
alter table public.presence_hourly enable row level security;
revoke all on public.presence_hourly from anon, authenticated;
grant select on public.presence_hourly to anon, authenticated;
create policy presence_hourly_read on public.presence_hourly for select to anon, authenticated using (true);

/** CrowdMap users at a place right now (heartbeat in the last 10 minutes). */
create function public.here_now(p_place uuid) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.presence
  where place_id = p_place and updated_at > now() - interval '10 minutes';
$$;

/**
 * How many people at once makes a place at least "moderate" (3). Many
 * CrowdMap users at once means it can't be empty; few users prove nothing,
 * so presence only ever raises the level, never lowers it.
 */
create function public.presence_floor(p_category text, p_here int) returns int
language sql immutable set search_path = '' as $$
  with k as (select case
    when p_category in ('cafe', 'restaurant', 'bank') then 3
    when p_category in ('park', 'station', 'mall', 'hospital', 'education') then 8
    else 5 end as per_level)
  select case when p_here >= (select per_level from k)
              then least(5, 2 + p_here / (select per_level from k))::int
              else null end;
$$;

/** Sends "something changed at this place" to everyone viewing the city. */
create function public.notify_city(p_city text, p_place uuid, p_kind text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_city is null then return; end if;
  perform realtime.send(jsonb_build_object('place_id', p_place, 'kind', p_kind), 'changed', 'crowd:' || p_city, false);
exception when others then
  -- Realtime is a nice-to-have; never fail the user's action because of it.
  raise warning 'notify_city failed: %', sqlerrm;
end $$;
revoke all on function public.notify_city(text, uuid, text) from public, anon, authenticated;

/**
 * Called about once a minute while a user shares their location. Ignores
 * weak fixes and fast repeats, refuses teleports, and finds the place they are at.
 */
create function public.heartbeat(p_lat double precision, p_lng double precision, p_accuracy real) returns jsonb
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
  order by extensions.st_distance(p.location, pt) limit 1;

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
revoke all on function public.heartbeat(double precision, double precision, real) from public, anon;
grant execute on function public.heartbeat(double precision, double precision, real) to authenticated;

/** Stop sharing: forget my position now. */
create function public.stop_presence() returns void
language plpgsql security definer set search_path = '' as $$
declare prev public.presence;
begin
  delete from public.presence where user_id = auth.uid() returning * into prev;
  if prev.place_id is not null then perform public.notify_city(prev.city_id, prev.place_id, 'presence'); end if;
end $$;
revoke all on function public.stop_presence() from public, anon;
grant execute on function public.stop_presence() to authenticated;

-- ---------------------------------------------------------------------------
-- Live level now includes presence as a floor.
-- ---------------------------------------------------------------------------
drop view public.place_crowd_now;
drop function public.live_level(uuid);

create function public.live_level(p_place uuid)
returns table (level real, weight real, reports int, last_report_at timestamptz, here int)
language sql stable security definer set search_path = '' as $$
  with w as (
    select r.level, r.created_at,
           exp(-extract(epoch from now() - r.created_at) / 1800.0)
             * case when r.is_sample then 0.6 else 0.5 + coalesce(pr.trust_score, 0.5) end as weight
    from public.crowd_reports r
    left join public.profiles pr on pr.id = r.user_id
    where r.place_id = p_place
      and r.created_at > now() - interval '90 minutes'
      and (r.is_sample or pr.status = 'active')
  ), q as (
    select coalesce(sum(k.crowd_effect), 0) as nudge
    from public.quick_reports qr join public.quick_report_kinds k using (kind)
    where qr.place_id = p_place and qr.expires_at > now()
  ), rep as (
    select case when sum(w.weight) >= 0.3
                then greatest(1, least(5, sum(w.level * w.weight) / sum(w.weight) + (select nudge from q) * 0.5)) end as level,
           sum(w.weight) as weight, count(*)::int as reports, max(w.created_at) as last_report_at
    from w
  ), pres as (
    select public.here_now(p_place) as here,
           public.presence_floor((select category from public.places where id = p_place), public.here_now(p_place)) as floor
  )
  select greatest(rep.level, pres.floor)::real, rep.weight::real, rep.reports, rep.last_report_at, pres.here
  from rep, pres
  where rep.level is not null or pres.floor is not null;
$$;

create view public.place_crowd_now with (security_invoker = false) as
  select p.id as place_id, p.city_id,
         round(coalesce(l.level, public.estimated_level(p.id, p.category)))::int as level,
         case when l.level is not null then 'live' else 'estimated' end as source,
         l.reports, l.last_report_at, coalesce(l.here, 0) as here
  from public.places p
  left join lateral public.live_level(p.id) l on true
  where p.status <> 'removed';
revoke all on public.place_crowd_now from anon, authenticated;
grant select on public.place_crowd_now to authenticated;

create or replace function public.crowd_map(p_city text) returns jsonb
language sql stable security definer set search_path = '' as $$
  with here as (
    select place_id, count(*)::int as n from public.presence
    where city_id = p_city and updated_at > now() - interval '10 minutes' and place_id is not null
    group by 1
  )
  select jsonb_build_object(
    'places', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'name_hi', p.name_hi, 'category', p.category,
        'lat', p.lat, 'lng', p.lng, 'status', p.status,
        'level', round(coalesce(l.level, public.estimated_level(p.id, p.category)))::int,
        'source', case when l.level is not null then 'live' else 'estimated' end,
        'reports', coalesce(l.reports, 0), 'here', coalesce(h.n, 0)))
      from public.places p
      left join lateral public.live_level(p.id) l on true
      left join here h on h.place_id = p.id
      where p.city_id = p_city and p.status <> 'removed'), '[]'::jsonb),
    'alerts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', q.id, 'kind', q.kind, 'place_id', q.place_id, 'lat', q.lat, 'lng', q.lng,
        'still_there', q.still_there, 'gone', q.gone, 'created_at', q.created_at, 'expires_at', q.expires_at))
      from public.quick_reports q where q.city_id = p_city and q.expires_at > now()), '[]'::jsonb),
    'generated_at', now());
$$;

create or replace function public.place_details(p_place uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'place', jsonb_build_object('id', p.id, 'name', p.name, 'name_hi', p.name_hi, 'category', p.category,
                                'address', p.address, 'lat', p.lat, 'lng', p.lng, 'radius_m', p.radius_m,
                                'city_id', p.city_id, 'osm_type', p.osm_type, 'osm_id', p.osm_id,
                                'status', p.status, 'added_by_me', p.added_by = auth.uid()),
    'confirmations', jsonb_build_object(
      'yes', (select count(*) from public.place_confirmations c where c.place_id = p.id and c.exists_here),
      'no', (select count(*) from public.place_confirmations c where c.place_id = p.id and not c.exists_here),
      'mine', (select c.exists_here from public.place_confirmations c where c.place_id = p.id and c.user_id = auth.uid())),
    'crowd', jsonb_build_object(
      'level', round(coalesce(l.level, public.estimated_level(p.id, p.category)))::int,
      'source', case when l.level is not null then 'live' else 'estimated' end,
      'reports', coalesce(l.reports, 0), 'last_report_at', l.last_report_at,
      'here', public.here_now(p.id)),
    'alerts', coalesce((select jsonb_agg(jsonb_build_object(
        'id', q.id, 'kind', q.kind, 'still_there', q.still_there, 'gone', q.gone,
        'created_at', q.created_at, 'expires_at', q.expires_at, 'mine', q.user_id = auth.uid())
        order by q.created_at desc)
      from public.quick_reports q where q.place_id = p.id and q.expires_at > now()), '[]'::jsonb),
    'my_report', (select jsonb_build_object('id', r.id, 'level', r.level, 'created_at', r.created_at,
                    'editable', r.created_at > now() - interval '15 minutes')
                  from public.crowd_reports r
                  where r.place_id = p.id and r.user_id = auth.uid()
                  order by r.created_at desc limit 1),
    'signed_in', auth.uid() is not null)
  from public.places p
  left join lateral public.live_level(p.id) l on true
  where p.id = p_place and p.status <> 'removed';
$$;

-- search_places and place_details/forecast use live_level(...).level only, so they keep working.

-- ---------------------------------------------------------------------------
-- Instant updates: tell the city's viewers whenever reports, alerts or places change.
-- ---------------------------------------------------------------------------
create function public.broadcast_crowd_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  row_place uuid;
  row_city text;
begin
  if tg_table_name = 'places' then
    row_place := coalesce(new.id, old.id);
    row_city := coalesce(new.city_id, old.city_id);
  elsif tg_table_name = 'quick_reports' then
    row_place := coalesce(new.place_id, old.place_id);
    row_city := coalesce(new.city_id, old.city_id);
  else -- crowd_reports
    row_place := coalesce(new.place_id, old.place_id);
    select city_id into row_city from public.places where id = row_place;
  end if;
  perform public.notify_city(row_city, row_place, tg_table_name);
  return null;
end $$;

create trigger crowd_reports_broadcast after insert or update or delete on public.crowd_reports
  for each row execute function public.broadcast_crowd_change();
create trigger quick_reports_broadcast after insert or update or delete on public.quick_reports
  for each row execute function public.broadcast_crowd_change();
create trigger places_broadcast after insert or update of status, name, category or delete on public.places
  for each row execute function public.broadcast_crowd_change();
