-- Crowd bubbles for every city, and the Community page.
-- * crowd_overview(): one row per city with its typical crowd right now, how many
--   places it has and how many are live, so the map can draw a bubble for every
--   city when zoomed out (not just the city that's loaded).
-- * city_media(): the newest visible photos and videos posted anywhere in a city.
-- * city_posts(): the newest community activity in a city (comments on photos and
--   quick alerts). No user ids are returned, only display names.

create or replace function public.crowd_overview()
returns jsonb
language sql stable security definer set search_path = '' as $$
  with pat as (
    -- Same as estimated_level(): this hour's typical level per category (India time).
    select c.category,
           (case when extract(isodow from now() at time zone 'Asia/Kolkata') in (6, 7)
                 then coalesce(c.weekend, c.weekday) else c.weekday end)
             [extract(hour from now() at time zone 'Asia/Kolkata')::int + 1] as base
    from public.crowd_patterns c
  ), agg as (
    select p.city_id, count(*)::int as n, avg(coalesce(pc.base, po.base)) as lvl
    from public.places p
    left join pat pc on pc.category = p.category
    left join pat po on po.category = 'other'
    where p.status <> 'removed'
    group by 1
  ), live as (
    select p.city_id, count(distinct r.place_id)::int as n
    from public.crowd_reports r join public.places p on p.id = r.place_id
    where r.created_at > now() - interval '90 minutes' and p.status <> 'removed'
    group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'name', c.name, 'name_hi', c.name_hi, 'state', c.state,
      'lat', round(c.lat::numeric, 4), 'lng', round(c.lng::numeric, 4), 'zoom', c.default_zoom,
      'places', coalesce(a.n, 0),
      'level', case when a.n is null then null else greatest(1, least(5, round(a.lvl)))::int end,
      'live', coalesce(l.n, 0))
    order by c.sort_order, c.name), '[]'::jsonb)
  from public.cities c
  left join agg a on a.city_id = c.id
  left join live l on l.city_id = c.id;
$$;
grant execute on function public.crowd_overview() to anon, authenticated;

create or replace function public.city_media(p_city text, p_limit int default 24)
returns table (id uuid, kind text, mime text, caption text, storage_path text, created_at timestamptz,
               author text, place_id uuid, place_name text, comment_count int, is_sample boolean)
language sql stable security definer set search_path = '' as $$
  select m.id, m.kind, m.mime, m.caption, m.storage_path, m.created_at, pr.display_name, p.id, p.name,
         (select count(*)::int from public.comments c join public.profiles cp on cp.id = c.user_id
           where c.media_id = m.id and c.status = 'visible' and cp.status = 'active'),
         m.is_sample
  from public.media m
  join public.profiles pr on pr.id = m.user_id
  join public.places p on p.id = m.place_id
  where p.city_id = p_city and m.kind in ('photo', 'video')
    and m.status = 'visible' and pr.status = 'active' and p.status <> 'removed'
  order by m.created_at desc
  limit least(greatest(coalesce(p_limit, 24), 1), 60);
$$;
grant execute on function public.city_media(text, int) to anon, authenticated;

create or replace function public.city_posts(p_city text, p_limit int default 20)
returns jsonb
language sql stable security definer set search_path = '' as $$
  with lim as (select least(greatest(coalesce(p_limit, 20), 1), 50) as n),
  said as (
    select jsonb_build_object('type', 'comment', 'id', c.id, 'body', c.body, 'author', pr.display_name,
             'place_id', p.id, 'place', p.name, 'at', c.created_at, 'sample', m.is_sample) as x, c.created_at as at
    from public.comments c
    join public.profiles pr on pr.id = c.user_id
    join public.media m on m.id = c.media_id
    join public.profiles mp on mp.id = m.user_id
    join public.places p on p.id = m.place_id
    where p.city_id = p_city and c.status = 'visible' and pr.status = 'active'
      and m.status = 'visible' and mp.status = 'active' and p.status <> 'removed'
    order by c.created_at desc limit (select n from lim)
  ), alerts as (
    select jsonb_build_object('type', 'alert', 'id', q.id, 'kind', q.kind, 'place_id', p.id, 'place', p.name,
             'at', q.created_at, 'active', q.expires_at > now(), 'still_there', q.still_there, 'sample', q.is_sample) as x,
           q.created_at as at
    from public.quick_reports q
    left join public.places p on p.id = q.place_id and p.status <> 'removed'
    where q.city_id = p_city and q.created_at > now() - interval '7 days'
    order by q.created_at desc limit (select n from lim)
  )
  select coalesce(jsonb_agg(s.x order by s.at desc), '[]'::jsonb)
  from (select * from (select * from said union all select * from alerts) u order by u.at desc limit (select n from lim)) s;
$$;
grant execute on function public.city_posts(text, int) to anon, authenticated;
