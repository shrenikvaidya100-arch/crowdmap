-- User 2: photo / video / audio uploads with comments.
--
-- Flow: the app asks begin_media_upload() for a slot (GPS-checked at the place,
-- rate-limited), uploads the file straight to Storage with a one-time signed URL,
-- then calls finish_media_upload(), which checks the stored object's size and
-- type before the item becomes visible. Files live in the private "media" bucket;
-- the server hands out short-lived signed links only for visible items.
--
-- Uploader ids are never readable by other users: public reads go through
-- place_media() / media_comments(), which return display names and a "mine" flag.

-- ---------------------------------------------------------------------------
-- Storage bucket (private). Size and type limits are enforced by Storage too.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', false, 26214400,
        array['image/jpeg', 'image/webp', 'video/webm', 'video/mp4', 'audio/webm', 'audio/mp4', 'audio/ogg'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
-- No storage.objects policies: only the server (service role) reads or writes this bucket.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.media (
  id            uuid primary key default gen_random_uuid(),
  place_id      uuid not null references public.places(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  kind          text not null check (kind in ('photo', 'video', 'audio')),
  mime          text not null,
  size_bytes    int  not null check (size_bytes between 1 and 26214400),
  duration_s    real check (duration_s is null or duration_s between 0 and 31),
  caption       text check (caption is null or char_length(caption) <= 280),
  storage_path  text not null unique,
  status        text not null default 'pending' check (status in ('pending', 'visible', 'removed')),
  removed_by    text check (removed_by in ('owner', 'admin', 'system')),
  removed_reason text,
  is_sample     boolean not null default false,
  created_at    timestamptz not null default now(),
  edited_at     timestamptz
);
create index media_place_idx on public.media (place_id, created_at desc) where status = 'visible';
create index media_user_idx on public.media (user_id, created_at desc);

create table public.comments (
  id         uuid primary key default gen_random_uuid(),
  media_id   uuid not null references public.media(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 500),
  status     text not null default 'visible' check (status in ('visible', 'removed')),
  removed_by text check (removed_by in ('admin', 'system')),
  removed_reason text,
  created_at timestamptz not null default now(),
  edited_at  timestamptz
);
create index comments_media_idx on public.comments (media_id, created_at) where status = 'visible';
create index comments_user_idx on public.comments (user_id, created_at desc);

-- Owners and admins read rows directly; everyone else uses the functions below.
alter table public.media enable row level security;
alter table public.comments enable row level security;
revoke all on public.media, public.comments from anon, authenticated;
grant select on public.media, public.comments to authenticated;
create policy media_read_own_or_admin on public.media for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy comments_read_own_or_admin on public.comments for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
-- All writes go through the security-definer functions below.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

/** Text that is empty, mostly symbols, one character repeated, or contains links. */
create function public.is_junk_text(p text) returns boolean
language sql immutable set search_path = '' as $$
  select p is null
      or char_length(trim(p)) = 0
      or trim(p) ~* '(https?:|www\.|\.com\b|\.in\b)'
      or trim(p) ~ '(.)\1{7,}'
      or char_length(regexp_replace(p, '[[:alnum:][:space:]]', '', 'g')) > char_length(p) / 2;
$$;

/**
 * Is the caller physically at the place? Same rules as the crowd checks:
 * accuracy at most 75 m, readings that agree, inside the place's radius, and no
 * "teleporting" since the user's last GPS-checked action. Returns a reason or null.
 */
create function public.media_location_problem(
  p_user uuid, p_place uuid, p_lat double precision, p_lng double precision,
  p_accuracy real, p_spread real
) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  pt extensions.geography;
  dist real;
  allowed real;
  prev record;
begin
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    return 'bad_location';
  end if;
  if p_accuracy is null or p_accuracy > 75 then return 'low_accuracy'; end if;
  if coalesce(p_spread, 0) > 100 then return 'unstable_location'; end if;
  pt := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;
  select extensions.st_distance(location, pt), radius_m + least(p_accuracy, 50)
    into dist, allowed from public.places where id = p_place and status <> 'removed';
  if dist is null then return 'unknown_place'; end if;
  if dist > allowed then return 'not_at_place'; end if;
  select lat, lng, at into prev from public.location_checks
    where user_id = p_user and accepted and at > now() - interval '2 hours' order by at desc limit 1;
  if found then
    declare
      km real := extensions.st_distance(
        extensions.st_setsrid(extensions.st_makepoint(prev.lng, prev.lat), 4326)::extensions.geography, pt) / 1000;
      hours real := greatest(extract(epoch from now() - prev.at) / 3600, 1.0 / 3600);
    begin
      if km > 2 and km / hours > 200 then return 'impossible_travel'; end if;
    end;
  end if;
  return null;
end $$;
revoke all on function public.media_location_problem(uuid, uuid, double precision, double precision, real, real)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Uploads
-- ---------------------------------------------------------------------------
create function public.begin_media_upload(
  p_place uuid, p_kind text, p_mime text, p_size int, p_duration real, p_caption text,
  p_lat double precision, p_lng double precision, p_accuracy real, p_spread real default 0
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_active_user();
  problem text;
  ext text;
  new_id uuid := gen_random_uuid();
  path text;
  cap text := nullif(trim(coalesce(p_caption, '')), '');
begin
  if p_kind not in ('photo', 'video', 'audio') then raise exception 'unknown media kind'; end if;
  ext := case
    when p_kind = 'photo' and p_mime = 'image/jpeg' then 'jpg'
    when p_kind = 'photo' and p_mime = 'image/webp' then 'webp'
    when p_kind = 'video' and p_mime = 'video/webm' then 'webm'
    when p_kind = 'video' and p_mime = 'video/mp4' then 'mp4'
    when p_kind = 'audio' and p_mime = 'audio/webm' then 'webm'
    when p_kind = 'audio' and p_mime = 'audio/mp4' then 'm4a'
    when p_kind = 'audio' and p_mime = 'audio/ogg' then 'ogg' end;
  if ext is null then return jsonb_build_object('ok', false, 'reason', 'bad_type'); end if;
  if p_size is null or p_size < 1 or p_size > 26214400 then
    return jsonb_build_object('ok', false, 'reason', 'too_large');
  end if;
  if p_kind in ('video', 'audio') and (p_duration is null or p_duration > 31) then
    return jsonb_build_object('ok', false, 'reason', 'too_long');
  end if;
  if cap is not null and (char_length(cap) > 280 or public.is_junk_text(cap)) then
    return jsonb_build_object('ok', false, 'reason', 'bad_caption');
  end if;
  if (select count(*) from public.media where user_id = uid and created_at > now() - interval '1 hour') >= 10 then
    perform public.log_event_as(uid, 'user', 'media.upload_rejected', 'place', p_place::text,
      jsonb_build_object('reason', 'rate_limited', 'kind', p_kind));
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  problem := public.media_location_problem(uid, p_place, p_lat, p_lng, p_accuracy, p_spread);
  if problem is not null then
    perform public.log_event_as(uid, 'user', 'media.upload_rejected', 'place', p_place::text,
      jsonb_build_object('reason', problem, 'kind', p_kind, 'accuracy_m', p_accuracy));
    return jsonb_build_object('ok', false, 'reason', problem);
  end if;

  path := uid::text || '/' || new_id::text || '.' || ext;
  insert into public.media (id, place_id, user_id, kind, mime, size_bytes, duration_s, caption, storage_path)
  values (new_id, p_place, uid, p_kind, p_mime, p_size, case when p_kind = 'photo' then null else p_duration end, cap, path);
  return jsonb_build_object('ok', true, 'id', new_id, 'path', path);
end $$;
revoke all on function public.begin_media_upload(uuid, text, text, int, real, text, double precision, double precision, real, real) from public, anon;
grant execute on function public.begin_media_upload(uuid, text, text, int, real, text, double precision, double precision, real, real) to authenticated;

/** Publishes an upload once the stored file matches what was announced. */
create function public.finish_media_upload(p_media uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_active_user();
  m public.media;
  obj record;
begin
  select * into m from public.media where id = p_media and user_id = uid;
  if not found then raise exception 'media not found'; end if;
  if m.status <> 'pending' then return jsonb_build_object('ok', m.status = 'visible', 'reason', 'not_pending'); end if;
  if m.created_at < now() - interval '30 minutes' then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;
  select (metadata ->> 'size')::bigint as size, metadata ->> 'mimetype' as mime into obj
    from storage.objects where bucket_id = 'media' and name = m.storage_path;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_uploaded'); end if;
  if obj.size is null or obj.size > 26214400 or obj.mime is distinct from m.mime then
    return jsonb_build_object('ok', false, 'reason', 'file_mismatch');
  end if;
  update public.media set status = 'visible', size_bytes = obj.size where id = p_media;
  perform public.log_event_as(uid, 'user', 'media.upload', 'media', p_media::text,
    jsonb_build_object('place_id', m.place_id, 'kind', m.kind, 'size_bytes', obj.size, 'duration_s', m.duration_s));
  return jsonb_build_object('ok', true, 'id', p_media);
end $$;
revoke all on function public.finish_media_upload(uuid) from public, anon;
grant execute on function public.finish_media_upload(uuid) to authenticated;

create function public.edit_my_media(p_media uuid, p_caption text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_active_user();
  cap text := nullif(trim(coalesce(p_caption, '')), '');
  old text;
begin
  select caption into old from public.media where id = p_media and user_id = uid and status = 'visible';
  if not found then raise exception 'media not found'; end if;
  if cap is not null and (char_length(cap) > 280 or public.is_junk_text(cap)) then
    return jsonb_build_object('ok', false, 'reason', 'bad_caption');
  end if;
  update public.media set caption = cap, edited_at = now() where id = p_media;
  perform public.log_event_as(uid, 'user', 'media.edit', 'media', p_media::text,
    jsonb_build_object('old_caption', old, 'new_caption', cap));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.edit_my_media(uuid, text) from public, anon;
grant execute on function public.edit_my_media(uuid, text) to authenticated;

/**
 * Owner deletes their upload. The row and its comments are deleted; the caller
 * (server) then removes the stored file using the returned path.
 */
create function public.delete_my_media(p_media uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_active_user();
  m public.media;
begin
  select * into m from public.media where id = p_media and user_id = uid;
  if not found then raise exception 'media not found'; end if;
  delete from public.media where id = p_media;
  perform public.log_event_as(uid, 'user', 'media.delete', 'media', p_media::text,
    jsonb_build_object('place_id', m.place_id, 'kind', m.kind, 'caption', m.caption, 'status', m.status));
  return jsonb_build_object('ok', true, 'path', m.storage_path);
end $$;
revoke all on function public.delete_my_media(uuid) from public, anon;
grant execute on function public.delete_my_media(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Comments
-- ---------------------------------------------------------------------------
create function public.add_comment(p_media uuid, p_body text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_active_user();
  b text := trim(coalesce(p_body, ''));
  new_id uuid;
begin
  if not exists (select 1 from public.media m join public.places p on p.id = m.place_id
                 where m.id = p_media and m.status = 'visible' and p.status <> 'removed') then
    raise exception 'media not found';
  end if;
  if char_length(b) not between 1 and 500 or public.is_junk_text(b) then
    return jsonb_build_object('ok', false, 'reason', 'bad_text');
  end if;
  if (select count(*) from public.comments where user_id = uid and created_at > now() - interval '10 minutes') >= 10 then
    perform public.log_event_as(uid, 'user', 'comment.rejected', 'media', p_media::text,
      jsonb_build_object('reason', 'rate_limited'));
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;
  if exists (select 1 from public.comments where user_id = uid and lower(body) = lower(b)
             and created_at > now() - interval '1 hour') then
    perform public.log_event_as(uid, 'user', 'comment.rejected', 'media', p_media::text,
      jsonb_build_object('reason', 'duplicate'));
    return jsonb_build_object('ok', false, 'reason', 'duplicate');
  end if;
  insert into public.comments (media_id, user_id, body) values (p_media, uid, b) returning id into new_id;
  perform public.log_event_as(uid, 'user', 'comment.add', 'comment', new_id::text,
    jsonb_build_object('media_id', p_media, 'body', b));
  return jsonb_build_object('ok', true, 'id', new_id);
end $$;
revoke all on function public.add_comment(uuid, text) from public, anon;
grant execute on function public.add_comment(uuid, text) to authenticated;

create function public.edit_my_comment(p_comment uuid, p_body text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_active_user();
  b text := trim(coalesce(p_body, ''));
  old text;
begin
  select body into old from public.comments where id = p_comment and user_id = uid and status = 'visible';
  if not found then raise exception 'comment not found'; end if;
  if char_length(b) not between 1 and 500 or public.is_junk_text(b) then
    return jsonb_build_object('ok', false, 'reason', 'bad_text');
  end if;
  update public.comments set body = b, edited_at = now() where id = p_comment;
  perform public.log_event_as(uid, 'user', 'comment.edit', 'comment', p_comment::text,
    jsonb_build_object('old_body', old, 'new_body', b));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.edit_my_comment(uuid, text) from public, anon;
grant execute on function public.edit_my_comment(uuid, text) to authenticated;

create function public.delete_my_comment(p_comment uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_active_user();
  c public.comments;
begin
  select * into c from public.comments where id = p_comment and user_id = uid;
  if not found then raise exception 'comment not found'; end if;
  delete from public.comments where id = p_comment;
  perform public.log_event_as(uid, 'user', 'comment.delete', 'comment', p_comment::text,
    jsonb_build_object('media_id', c.media_id, 'body', c.body));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.delete_my_comment(uuid) from public, anon;
grant execute on function public.delete_my_comment(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Public reads (no user ids)
-- ---------------------------------------------------------------------------
create function public.place_media(p_place uuid, p_limit int default 30)
returns table (id uuid, kind text, mime text, caption text, duration_s real, storage_path text,
               created_at timestamptz, edited_at timestamptz, author text, mine boolean,
               comment_count int, is_sample boolean)
language sql stable security definer set search_path = '' as $$
  select m.id, m.kind, m.mime, m.caption, m.duration_s, m.storage_path, m.created_at, m.edited_at,
         pr.display_name, m.user_id = auth.uid(),
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
grant execute on function public.place_media(uuid, int) to anon, authenticated;

create function public.media_comments(p_media uuid)
returns table (id uuid, body text, created_at timestamptz, edited_at timestamptz, author text, mine boolean)
language sql stable security definer set search_path = '' as $$
  select c.id, c.body, c.created_at, c.edited_at, pr.display_name, c.user_id = auth.uid()
  from public.comments c
  join public.profiles pr on pr.id = c.user_id
  join public.media m on m.id = c.media_id
  join public.profiles mp on mp.id = m.user_id
  where c.media_id = p_media and c.status = 'visible' and pr.status = 'active'
    and m.status = 'visible' and mp.status = 'active'
  order by c.created_at
  limit 200;
$$;
grant execute on function public.media_comments(uuid) to anon, authenticated;

/** The caller's comments with the place they belong to, for My activity. */
create function public.my_comments()
returns table (id uuid, body text, created_at timestamptz, edited_at timestamptz, status text,
               media_id uuid, media_kind text, place_id uuid, place_name text, place_name_hi text, city_id text)
language sql stable security definer set search_path = '' as $$
  select c.id, c.body, c.created_at, c.edited_at, c.status, m.id, m.kind, p.id, p.name, p.name_hi, p.city_id
  from public.comments c
  join public.media m on m.id = c.media_id
  join public.places p on p.id = m.place_id
  where c.user_id = auth.uid()
  order by c.created_at desc limit 500;
$$;
grant execute on function public.my_comments() to authenticated;

-- Abandoned upload slots (never finished) are cleaned up by the server job; they
-- are never shown to anyone.
