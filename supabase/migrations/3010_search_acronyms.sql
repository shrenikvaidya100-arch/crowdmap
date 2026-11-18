-- Search understands initials: "IIM Indore" finds "Indian Institute of Management
-- Indore", "AIIMS" finds "All India Institute of Medical Sciences". A name's
-- initials skip small words (of, the, and, for). Every word of the query must
-- appear in the name or start its initials; such a match ranks like a name match.
create or replace function public.name_initials(p_name text)
returns text language sql immutable parallel safe set search_path = '' as $$
  select coalesce(string_agg(left(w, 1), '' order by n), '')
  from regexp_split_to_table(lower(p_name), '[^a-z]+') with ordinality as t(w, n)
  where w <> '' and w not in ('of', 'the', 'and', 'for', 'at', 'in');
$$;

-- Stored once per place so searching doesn't recompute them.
alter table public.places add column if not exists initials text
  generated always as (public.name_initials(name)) stored;

create or replace function public.search_places(p_query text, p_city text default null, p_limit int default 8)
returns jsonb
language sql stable security definer set search_path = '' as $$
  with q as (
    select lower(trim(p_query)) as s,
           -- Escape LIKE wildcards typed by the user.
           replace(replace(replace(lower(trim(p_query)), '\', '\\'), '%', '\%'), '_', '\_') as esc,
           trim(p_query) as raw,
           -- Query words made only of letters (for initials matching).
           array(select w from regexp_split_to_table(lower(trim(p_query)), '\s+') w where w ~ '^[a-z]{2,}$') as words
  ), scored as (
    select p.*, q.*,
      -- Every query word is in the name or starts the initials, and at least one is initials.
      (cardinality(q.words) > 0
       and exists (select 1 from unnest(q.words) w
                   where p.initials like w || '%' and char_length(w) between 2 and 6)
       and not exists (select 1 from unnest(q.words) w
                       where lower(p.name) not like '%' || w || '%' and p.initials not like w || '%')) as by_initials
    from public.places p, q
    where p.status <> 'removed' and char_length(q.s) between 2 and 60
  ), hits as (
    select s.id, s.name, s.name_hi, s.category, s.city_id, s.lat, s.lng,
      (case when lower(s.name) = s.s or s.name_hi = s.raw then 3
            when s.by_initials then 2.5
            when lower(s.name) like s.esc || '%' or s.name_hi like s.esc || '%' then 2
            when lower(s.name) like '%' || s.esc || '%' or s.name_hi like '%' || s.esc || '%' then 1
            else 0 end
       + extensions.word_similarity(s.s, lower(s.name))
       + case when s.city_id = p_city then 0.5 else 0 end) as rank
    from scored s
    where lower(s.name) like '%' || s.esc || '%'
       or s.name_hi like '%' || s.esc || '%'
       or s.by_initials
       or extensions.word_similarity(s.s, lower(s.name)) >= 0.45
    order by rank desc, s.name
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

revoke all on function public.name_initials(text) from public;
