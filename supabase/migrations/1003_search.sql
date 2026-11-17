-- User 1: place search with typo tolerance (trigram similarity), English and Hindi names.

create extension if not exists pg_trgm with schema extensions;

create index places_name_trgm_idx on public.places using gin (lower(name) extensions.gin_trgm_ops);
create index places_name_hi_trgm_idx on public.places using gin (name_hi extensions.gin_trgm_ops);

/**
 * Ranked suggestions for a search box. Exact > starts-with > contains > similar
 * spelling; places in the current city rank a little higher. Returns one JSON
 * array (max 20) including each place's current crowd level.
 */
create function public.search_places(p_query text, p_city text default null, p_limit int default 8)
returns jsonb
language sql stable security definer set search_path = '' as $$
  with q as (
    select lower(trim(p_query)) as s,
           -- Escape LIKE wildcards typed by the user.
           replace(replace(replace(lower(trim(p_query)), '\', '\\'), '%', '\%'), '_', '\_') as esc,
           trim(p_query) as raw
  ), hits as (
    select p.id, p.name, p.name_hi, p.category, p.city_id, p.lat, p.lng,
      (case when lower(p.name) = q.s or p.name_hi = q.raw then 3
            when lower(p.name) like q.esc || '%' or p.name_hi like q.esc || '%' then 2
            when lower(p.name) like '%' || q.esc || '%' or p.name_hi like '%' || q.esc || '%' then 1
            else 0 end
       + extensions.similarity(lower(p.name), q.s)
       + case when p.city_id = p_city then 0.5 else 0 end) as rank
    from public.places p, q
    where p.status <> 'removed'
      and char_length(q.s) between 2 and 60
      and (lower(p.name) like '%' || q.esc || '%'
           or p.name_hi like '%' || q.esc || '%'
           or extensions.similarity(lower(p.name), q.s) > 0.35)
    order by rank desc, p.name
    limit least(greatest(coalesce(p_limit, 8), 1), 20)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', h.id, 'name', h.name, 'name_hi', h.name_hi, 'category', h.category, 'city_id', h.city_id,
      'lat', h.lat, 'lng', h.lng,
      'level', round(coalesce(l.level, public.estimated_level(h.id, h.category)))::int,
      'source', case when l.level is not null then 'live' else 'estimated' end)
    order by h.rank desc, h.name), '[]'::jsonb)
  from hits h left join lateral public.live_level(h.id) l on true;
$$;
revoke all on function public.search_places(text, text, int) from public;
grant execute on function public.search_places(text, text, int) to anon, authenticated;
