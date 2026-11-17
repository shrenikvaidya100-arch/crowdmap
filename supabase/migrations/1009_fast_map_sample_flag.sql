-- User 1: faster map query, and a "sample" flag so demo data is always labelled.
--
-- crowd_map used to run live_level() for every place in the city. Only places
-- with recent reports, active alerts or people present can be live, so it now
-- runs live_level() just for those and uses the estimate for the rest.
-- "sample" is true when a place's live level comes only from sample reports.

create function public.sample_only(p_place uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.crowd_reports
                 where place_id = p_place and is_sample and created_at > now() - interval '90 minutes')
     and not exists (select 1 from public.crowd_reports
                     where place_id = p_place and not is_sample and created_at > now() - interval '90 minutes')
     and public.here_now(p_place) = 0;
$$;

create or replace function public.crowd_map(p_city text) returns jsonb
language sql stable security definer set search_path = '' as $$
  with active as (
    select r.place_id as id from public.crowd_reports r
      join public.places p on p.id = r.place_id
      where p.city_id = p_city and r.created_at > now() - interval '90 minutes'
    union
    select q.place_id from public.quick_reports q
      where q.city_id = p_city and q.expires_at > now() and q.place_id is not null
    union
    select pr.place_id from public.presence pr
      where pr.city_id = p_city and pr.updated_at > now() - interval '10 minutes' and pr.place_id is not null
  ), live as (
    select a.id, l.level, l.reports, l.here, public.sample_only(a.id) as sample
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
        'reports', coalesce(l.reports, 0), 'here', coalesce(l.here, 0)))
      from public.places p left join live l on l.id = p.id
      where p.city_id = p_city and p.status <> 'removed'), '[]'::jsonb),
    'alerts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', q.id, 'kind', q.kind, 'place_id', q.place_id, 'lat', q.lat, 'lng', q.lng, 'sample', q.is_sample,
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
      'sample', l.level is not null and public.sample_only(p.id),
      'reports', coalesce(l.reports, 0), 'last_report_at', l.last_report_at,
      'here', public.here_now(p.id)),
    'alerts', coalesce((select jsonb_agg(jsonb_build_object(
        'id', q.id, 'kind', q.kind, 'still_there', q.still_there, 'gone', q.gone, 'sample', q.is_sample,
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
