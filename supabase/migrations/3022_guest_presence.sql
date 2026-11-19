-- Passive location sharing without signing in. A visitor who isn't signed in gets a
-- random device id (an httpOnly cookie) and is counted like a signed-in person: the
-- "people here" count and the per-3-people crowd rise include both. Reporting a crowd
-- level, alerts, uploads and comments still need an account.

create table public.anon_presence (
  device_id  uuid primary key,
  lat        double precision not null check (lat between -90 and 90),
  lng        double precision not null check (lng between -180 and 180),
  accuracy_m real not null,
  place_id   uuid references public.places(id) on delete set null,
  city_id    text references public.cities(id),
  updated_at timestamptz not null default now()
);
create index anon_presence_place_idx on public.anon_presence (place_id, updated_at);
create index anon_presence_city_idx on public.anon_presence (city_id, updated_at);
alter table public.anon_presence enable row level security;
revoke all on public.anon_presence from anon, authenticated;

create or replace function public.here_now(p_place uuid) returns int
language sql stable security definer set search_path = '' as $$
  select (select count(*)::int from public.presence where place_id = p_place and updated_at > now() - interval '10 minutes')
       + (select count(*)::int from public.anon_presence where place_id = p_place and updated_at > now() - interval '10 minutes');
$$;

/** A guest's position (no account). Same place matching as signed-in sharing. */
create function public.heartbeat_anon(p_device uuid, p_lat double precision, p_lng double precision, p_accuracy real)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  pt extensions.geography;
  prev public.anon_presence;
  here public.places;
  city text;
begin
  if p_device is null or p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    return jsonb_build_object('ok', false, 'reason', 'bad_location');
  end if;
  pt := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;
  select * into prev from public.anon_presence where device_id = p_device;
  if found and prev.updated_at > now() - interval '30 seconds' then
    return jsonb_build_object('ok', true, 'throttled', true, 'place_id', prev.place_id);
  end if;
  -- Old guest rows are cleared as we go.
  delete from public.anon_presence where updated_at < now() - interval '1 hour';

  select p.* into here from public.places p
  where p.status <> 'removed' and extensions.st_dwithin(p.location, pt, p.radius_m + least(coalesce(p_accuracy, 0), 200))
  order by extensions.st_distance(p.location, pt), p.radius_m desc limit 1;
  if here.id is null then
    select p.* into here from public.places p
    where p.status = 'listed' and extensions.st_dwithin(p.location, pt, 300)
    order by extensions.st_distance(p.location, pt), p.radius_m desc limit 1;
  end if;
  select c.id into city from public.cities c
  where extensions.st_dwithin(extensions.st_setsrid(extensions.st_makepoint(c.lng, c.lat), 4326)::extensions.geography, pt, 40000)
  order by extensions.st_distance(extensions.st_setsrid(extensions.st_makepoint(c.lng, c.lat), 4326)::extensions.geography, pt)
  limit 1;

  insert into public.anon_presence (device_id, lat, lng, accuracy_m, place_id, city_id, updated_at)
  values (p_device, p_lat, p_lng, coalesce(p_accuracy, -1), here.id, city, now())
  on conflict (device_id) do update set lat = excluded.lat, lng = excluded.lng, accuracy_m = excluded.accuracy_m,
    place_id = excluded.place_id, city_id = excluded.city_id, updated_at = now();

  -- Tell people viewing the city that a place's count changed.
  if here.id is not null and here.id is distinct from prev.place_id then
    begin perform public.notify_city(city, here.id, 'presence'); exception when others then null; end;
  end if;
  return jsonb_build_object('ok', true, 'place_id', here.id, 'place_name', here.name, 'here', public.here_now(here.id));
end $$;
revoke all on function public.heartbeat_anon(uuid, double precision, double precision, real) from public;
grant execute on function public.heartbeat_anon(uuid, double precision, double precision, real) to anon, authenticated;

create function public.stop_presence_anon(p_device uuid) returns void
language sql security definer set search_path = '' as $$
  delete from public.anon_presence where device_id = p_device;
$$;
revoke all on function public.stop_presence_anon(uuid) from public;
grant execute on function public.stop_presence_anon(uuid) to anon, authenticated;

create or replace function public.crowd_map(p_city text)
returns jsonb
language sql stable security definer set search_path = '' as $$
  with here as (
    select x.place_id as id, count(*)::int as n from (
      select place_id, city_id, updated_at from public.presence
      union all
      select place_id, city_id, updated_at from public.anon_presence
    ) x
    where x.city_id = p_city and x.updated_at > now() - interval '10 minutes' and x.place_id is not null
    group by 1
  ), active as (
    select r.place_id as id from public.crowd_reports r
      join public.places p on p.id = r.place_id
      where p.city_id = p_city and r.created_at > now() - interval '90 minutes'
    union
    select q.place_id from public.quick_reports q
      where q.city_id = p_city and q.expires_at > now() and q.place_id is not null
    union
    select id from here
  ), live as (
    select a.id, l.level, l.reports, public.sample_only(a.id) as sample
    from active a cross join lateral public.live_level(a.id) l
  ), pending as (
    -- Reported in the last 45 minutes but not yet confirmed by a second person.
    select distinct r.place_id as id from public.crowd_reports r join public.places p on p.id = r.place_id
    where p.city_id = p_city and r.created_at > now() - interval '45 minutes' and not r.is_sample
      and not exists (select 1 from live where live.id = r.place_id)
  ), pat as (
    -- Same as estimated_level(): this hour's typical level per category (India time).
    select c.category,
           (case when extract(isodow from now() at time zone 'Asia/Kolkata') in (6, 7)
                 then coalesce(c.weekend, c.weekday) else c.weekday end)
             [extract(hour from now() at time zone 'Asia/Kolkata')::int + 1] as base
    from public.crowd_patterns c
  )
  select jsonb_build_object(
    'places', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'name_hi', p.name_hi, 'category', p.category,
        'lat', round(p.lat::numeric, 5), 'lng', round(p.lng::numeric, 5), 'status', p.status,
        'level', round(coalesce(l.level, greatest(1, least(5,
                   coalesce(pc.base, po.base) + ((abs(hashtext(p.id::text)) % 5) - 2) * 0.25))))::int,
        'source', case when l.level is not null then 'live' else 'estimated' end,
        'sample', coalesce(l.sample, false),
        'reports', coalesce(l.reports, 0), 'here', coalesce(h.n, 0),
        'pending', pe.id is not null))
      from public.places p
      left join live l on l.id = p.id
      left join here h on h.id = p.id
      left join pending pe on pe.id = p.id
      left join pat pc on pc.category = p.category
      left join pat po on po.category = 'other'
      where p.city_id = p_city and p.status <> 'removed'), '[]'::jsonb),
    'alerts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', q.id, 'kind', q.kind, 'place_id', q.place_id,
        'lat', round(q.lat::numeric, 5), 'lng', round(q.lng::numeric, 5), 'sample', q.is_sample,
        'still_there', q.still_there, 'gone', q.gone, 'created_at', q.created_at, 'expires_at', q.expires_at))
      from public.quick_reports q where q.city_id = p_city and q.expires_at > now()), '[]'::jsonb),
    'generated_at', now());
$$;
