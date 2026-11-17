-- User 1: fix for 1009. "here" (people present) is counted on its own, because
-- live_level() returns no row when presence alone doesn't change the level
-- (e.g. 1 person at a temple), which hid the count from the map.

create or replace function public.crowd_map(p_city text) returns jsonb
language sql stable security definer set search_path = '' as $$
  with here as (
    select pr.place_id as id, count(*)::int as n from public.presence pr
    where pr.city_id = p_city and pr.updated_at > now() - interval '10 minutes' and pr.place_id is not null
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
  )
  select jsonb_build_object(
    'places', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'name_hi', p.name_hi, 'category', p.category,
        'lat', p.lat, 'lng', p.lng, 'status', p.status,
        'level', round(coalesce(l.level, public.estimated_level(p.id, p.category)))::int,
        'source', case when l.level is not null then 'live' else 'estimated' end,
        'sample', coalesce(l.sample, false),
        'reports', coalesce(l.reports, 0), 'here', coalesce(h.n, 0)))
      from public.places p
      left join live l on l.id = p.id
      left join here h on h.id = p.id
      where p.city_id = p_city and p.status <> 'removed'), '[]'::jsonb),
    'alerts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', q.id, 'kind', q.kind, 'place_id', q.place_id, 'lat', q.lat, 'lng', q.lng, 'sample', q.is_sample,
        'still_there', q.still_there, 'gone', q.gone, 'created_at', q.created_at, 'expires_at', q.expires_at))
      from public.quick_reports q where q.city_id = p_city and q.expires_at > now()), '[]'::jsonb),
    'generated_at', now());
$$;
