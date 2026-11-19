-- Comments straight on a place, without posting a photo or video first. A comment
-- now belongs either to an upload (as before) or directly to a place.

alter table public.comments alter column media_id drop not null;
alter table public.comments add column place_id uuid references public.places(id) on delete cascade;
alter table public.comments add constraint comments_on_media_or_place check ((media_id is null) <> (place_id is null));
create index comments_place_idx on public.comments (place_id, created_at desc) where status = 'visible' and place_id is not null;

/** Add a comment on a place (same rules as comments on uploads). */
create function public.add_place_comment(p_place uuid, p_body text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_active_user();
  b text := trim(coalesce(p_body, ''));
  new_id uuid;
begin
  if not exists (select 1 from public.places where id = p_place and status <> 'removed') then raise exception 'place not found'; end if;
  if char_length(b) not between 1 and 500 or public.is_junk_text(b) then
    return jsonb_build_object('ok', false, 'reason', 'bad_text');
  end if;
  if (select count(*) from public.comments where user_id = uid and created_at > now() - interval '10 minutes') >= 10 then
    perform public.log_event_as(uid, 'user', 'comment.rejected', 'place', p_place::text, jsonb_build_object('reason', 'rate_limited'));
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;
  if exists (select 1 from public.comments where user_id = uid and lower(body) = lower(b) and created_at > now() - interval '1 hour') then
    perform public.log_event_as(uid, 'user', 'comment.rejected', 'place', p_place::text, jsonb_build_object('reason', 'duplicate'));
    return jsonb_build_object('ok', false, 'reason', 'duplicate');
  end if;
  insert into public.comments (place_id, user_id, body) values (p_place, uid, b) returning id into new_id;
  perform public.log_event_as(uid, 'user', 'comment.add', 'comment', new_id::text, jsonb_build_object('place_id', p_place, 'body', b));
  return jsonb_build_object('ok', true, 'id', new_id);
end $$;
revoke all on function public.add_place_comment(uuid, text) from public, anon;
grant execute on function public.add_place_comment(uuid, text) to authenticated;

/** Comments made straight on a place, newest first (no user ids). */
create function public.place_comments(p_place uuid)
returns table (id uuid, body text, created_at timestamptz, edited_at timestamptz, author text, mine boolean)
language sql stable security definer set search_path = '' as $$
  select c.id, c.body, c.created_at, c.edited_at, pr.display_name, coalesce(c.user_id = auth.uid(), false)
  from public.comments c
  join public.profiles pr on pr.id = c.user_id
  where c.place_id = p_place and c.status = 'visible' and pr.status = 'active'
  order by c.created_at desc
  limit 100;
$$;
grant execute on function public.place_comments(uuid) to anon, authenticated;


create or replace function public.my_comments()
returns table (id uuid, body text, created_at timestamptz, edited_at timestamptz, status text,
               media_id uuid, media_kind text, place_id uuid, place_name text, place_name_hi text, city_id text)
language sql stable security definer set search_path = '' as $$
  select c.id, c.body, c.created_at, c.edited_at, c.status, m.id, m.kind, p.id, p.name, p.name_hi, p.city_id
  from public.comments c
  left join public.media m on m.id = c.media_id
  join public.places p on p.id = coalesce(m.place_id, c.place_id)
  where c.user_id = auth.uid()
  order by c.created_at desc limit 500;
$$;

create or replace function public.admin_comments(
  p_status text default null, p_q text default null, p_limit int default 50, p_offset int default 0
) returns table (
  id uuid, body text, status text, removed_by text, removed_reason text, created_at timestamptz,
  user_id uuid, author text, author_status text, media_id uuid, media_kind text,
  place_id uuid, place_name text, total bigint
)
language plpgsql stable security definer set search_path = '' as $$
declare q text := nullif(trim(coalesce(p_q, '')), '');
begin
  perform public.require_admin();
  return query
  select c.id, c.body, c.status, c.removed_by, c.removed_reason, c.created_at, c.user_id, pr.display_name, pr.status,
         m.id, m.kind, p.id, p.name, count(*) over ()
  from public.comments c
  join public.profiles pr on pr.id = c.user_id
  left join public.media m on m.id = c.media_id
  join public.places p on p.id = coalesce(m.place_id, c.place_id)
  where (p_status is null or c.status = p_status)
    and (q is null or c.body ilike '%' || q || '%' or pr.display_name ilike '%' || q || '%' or p.name ilike '%' || q || '%')
  order by c.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0);
end $$;

create or replace function public.admin_comment_report_queue()
returns table (comment_id uuid, body text, author text, place_name text, reports int, reasons text[], first_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_admin();
  return query
  select c.id, c.body, pr.display_name, p.name, count(r.id)::int, array_agg(distinct r.reason), min(r.created_at)
  from public.comment_reports r
  join public.comments c on c.id = r.comment_id
  join public.profiles pr on pr.id = c.user_id
  left join public.media m on m.id = c.media_id
  join public.places p on p.id = coalesce(m.place_id, c.place_id)
  where r.status = 'open' and c.status = 'visible'
  group by c.id, c.body, pr.display_name, p.name
  order by count(r.id) desc, min(r.created_at)
  limit 100;
end $$;

create or replace function public.city_posts(p_city text, p_limit int default 20)
returns jsonb
language sql stable security definer set search_path = '' as $$
  with lim as (select least(greatest(coalesce(p_limit, 20), 1), 50) as n),
  said as (
    select jsonb_build_object('type', 'comment', 'id', c.id, 'body', c.body, 'author', pr.display_name,
             'place_id', p.id, 'place', p.name, 'at', c.created_at, 'sample', coalesce(m.is_sample, false)) as x, c.created_at as at
    from public.comments c
    join public.profiles pr on pr.id = c.user_id
    left join public.media m on m.id = c.media_id
    left join public.profiles mp on mp.id = m.user_id
    join public.places p on p.id = coalesce(m.place_id, c.place_id)
    where p.city_id = p_city and c.status = 'visible' and pr.status = 'active'
      and (c.media_id is null or (m.status = 'visible' and mp.status = 'active')) and p.status <> 'removed'
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
