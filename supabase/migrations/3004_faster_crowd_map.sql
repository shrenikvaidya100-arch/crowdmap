-- Review round 5: crowd_map runs on every map load and live update.
-- * The "typical crowd" (estimated_level) was looked up once per place (1,700+
--   lookups for Delhi or Mumbai); now the pattern for the current hour is
--   computed once per category and joined. Same formula, same result.
-- * Coordinates are sent with 5 decimals (about 1 m) instead of 15, which makes
--   the response noticeably smaller.
create or replace function public.crowd_map(p_city text)
returns jsonb
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
        'reports', coalesce(l.reports, 0), 'here', coalesce(h.n, 0)))
      from public.places p
      left join live l on l.id = p.id
      left join here h on h.id = p.id
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
