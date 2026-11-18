-- User 2: "mine" was null (not false) for logged-out viewers.
create or replace function public.place_media(p_place uuid, p_limit int default 30)
returns table (id uuid, kind text, mime text, caption text, duration_s real, storage_path text,
               created_at timestamptz, edited_at timestamptz, author text, mine boolean,
               comment_count int, is_sample boolean)
language sql stable security definer set search_path = '' as $$
  select m.id, m.kind, m.mime, m.caption, m.duration_s, m.storage_path, m.created_at, m.edited_at,
         pr.display_name, coalesce(m.user_id = auth.uid(), false),
         (select count(*)::int from public.comments c join public.profiles cp on cp.id = c.user_id
           where c.media_id = m.id and c.status = 'visible' and cp.status = 'active'),
         m.is_sample
  from public.media m
  join public.profiles pr on pr.id = m.user_id
  join public.places p on p.id = m.place_id
  where m.place_id = p_place and m.status = 'visible' and pr.status = 'active' and p.status <> 'removed'
  order by m.created_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

create or replace function public.media_comments(p_media uuid)
returns table (id uuid, body text, created_at timestamptz, edited_at timestamptz, author text, mine boolean)
language sql stable security definer set search_path = '' as $$
  select c.id, c.body, c.created_at, c.edited_at, pr.display_name, coalesce(c.user_id = auth.uid(), false)
  from public.comments c
  join public.profiles pr on pr.id = c.user_id
  join public.media m on m.id = c.media_id
  join public.profiles mp on mp.id = m.user_id
  where c.media_id = p_media and c.status = 'visible' and pr.status = 'active'
    and m.status = 'visible' and mp.status = 'active'
  order by c.created_at
  limit 200;
$$;
