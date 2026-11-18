-- User 2: admin dashboard.
-- Admins are made once at setup (scripts/user2/make-admin.mjs); there is no way
-- to become one from the website, and the 2-admin cap from 0001 still applies.
-- Every function here checks the caller is an active admin, and every change
-- is written to the audit log. Admins cannot remove other admins or themselves.
-- Removed accounts and content are hidden, never deleted, so they can be restored.

create function public.require_admin() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null or not public.is_admin() then raise exception 'admins only'; end if;
  return uid;
end $$;
revoke all on function public.require_admin() from public, anon;

/** A short reason is required whenever an admin hides or restores something. */
create function public.valid_admin_reason(p text) returns boolean
language sql immutable set search_path = '' as $$
  select p is not null and char_length(trim(p)) between 3 and 200;
$$;

-- ---------------------------------------------------------------------------
-- Overview
-- ---------------------------------------------------------------------------
create function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_admin();
  return jsonb_build_object(
    'users',           (select count(*) from public.profiles where not is_sample),
    'users_removed',   (select count(*) from public.profiles where status = 'removed'),
    'users_new_24h',   (select count(*) from public.profiles where created_at > now() - interval '24 hours'),
    'admins',          (select count(*) from public.profiles where role = 'admin' and status = 'active'),
    'reports_24h',     (select count(*) from public.crowd_reports where not is_sample and created_at > now() - interval '24 hours'),
    'alerts_active',   (select count(*) from public.quick_reports where not is_sample and expires_at > now()),
    'media_visible',   (select count(*) from public.media where status = 'visible'),
    'media_removed',   (select count(*) from public.media where status = 'removed'),
    'comments_visible',(select count(*) from public.comments where status = 'visible'),
    'comments_removed',(select count(*) from public.comments where status = 'removed'),
    'places_unconfirmed', (select count(*) from public.places where status = 'unconfirmed'),
    'rejections_24h',  (select count(*) from public.location_checks where not accepted and at > now() - interval '24 hours'),
    'audit_entries',   (select count(*) from public.audit_log),
    'audit_last_at',   (select max(at) from public.audit_log)
  );
end $$;
revoke all on function public.admin_stats() from public, anon;
grant execute on function public.admin_stats() to authenticated;

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------
create function public.admin_users(
  p_q text default null, p_status text default null, p_sort text default 'newest',
  p_limit int default 50, p_offset int default 0
) returns table (
  id uuid, display_name text, email text, role text, status text, removed_at timestamptz, removed_reason text,
  trust_score real, is_sample boolean, created_at timestamptz,
  reports int, alerts int, media int, comments int, places_added int, rejections int,
  last_active timestamptz, total bigint
)
language plpgsql stable security definer set search_path = '' as $$
declare q text := nullif(trim(coalesce(p_q, '')), '');
begin
  perform public.require_admin();
  return query
  with base as (
    select p.id, p.display_name, u.email::text as email, p.role, p.status, p.removed_at, p.removed_reason,
           p.trust_score, p.is_sample, p.created_at,
           (select count(*)::int from public.crowd_reports r where r.user_id = p.id) as reports,
           (select count(*)::int from public.quick_reports r where r.user_id = p.id) as alerts,
           (select count(*)::int from public.media m where m.user_id = p.id and m.status <> 'pending') as media,
           (select count(*)::int from public.comments c where c.user_id = p.id) as comments,
           (select count(*)::int from public.places pl where pl.added_by = p.id) as places_added,
           (select count(*)::int from public.location_checks l where l.user_id = p.id and not l.accepted) as rejections,
           (select max(a.at) from public.audit_log a where a.actor_id = p.id) as last_active
    from public.profiles p
    left join auth.users u on u.id = p.id
    where (p_status is null or p.status = p_status or (p_status = 'admin' and p.role = 'admin'))
      and (q is null or p.display_name ilike '%' || q || '%' or u.email ilike '%' || q || '%' or p.id::text = q)
  )
  select b.*, count(*) over () from base b
  order by
    case when p_sort = 'name' then lower(b.display_name) end asc,
    case when p_sort = 'oldest' then b.created_at end asc,
    case when p_sort = 'activity' then b.last_active end desc nulls last,
    case when p_sort = 'rejections' then b.rejections end desc,
    case when p_sort = 'contributions' then b.reports + b.alerts + b.media + b.comments + b.places_added end desc,
    b.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0);
end $$;
revoke all on function public.admin_users(text, text, text, int, int) from public, anon;
grant execute on function public.admin_users(text, text, text, int, int) to authenticated;

/**
 * Remove (hide) or restore an account. A removed account's reports, alerts,
 * uploads and comments disappear everywhere at once and come back on restore.
 */
create function public.admin_set_user_status(p_user uuid, p_status text, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  admin uuid := public.require_admin();
  target public.profiles;
begin
  if p_status not in ('active', 'removed') then raise exception 'bad status'; end if;
  if not public.valid_admin_reason(p_reason) then return jsonb_build_object('ok', false, 'reason', 'need_reason'); end if;
  select * into target from public.profiles where id = p_user for update;
  if not found then raise exception 'user not found'; end if;
  if target.id = admin then return jsonb_build_object('ok', false, 'reason', 'not_yourself'); end if;
  if target.role = 'admin' then return jsonb_build_object('ok', false, 'reason', 'not_admins'); end if;
  if target.status = p_status then return jsonb_build_object('ok', false, 'reason', 'no_change'); end if;

  update public.profiles
     set status = p_status,
         removed_at = case when p_status = 'removed' then now() end,
         removed_reason = case when p_status = 'removed' then trim(p_reason) end
   where id = p_user;
  -- profiles_audit logs the status change too; this entry carries the admin's reason either way.
  perform public.log_event_as(admin, 'admin',
    case when p_status = 'removed' then 'admin.user_remove' else 'admin.user_restore' end,
    'profile', p_user::text,
    jsonb_build_object('reason', trim(p_reason), 'previous_reason', target.removed_reason));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.admin_set_user_status(uuid, text, text) from public, anon;
grant execute on function public.admin_set_user_status(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Content
-- ---------------------------------------------------------------------------
create function public.admin_media(
  p_status text default null, p_q text default null, p_limit int default 30, p_offset int default 0
) returns table (
  id uuid, kind text, mime text, caption text, duration_s real, storage_path text, status text,
  removed_by text, removed_reason text, created_at timestamptz, user_id uuid, author text, author_status text,
  place_id uuid, place_name text, city_id text, comment_count int, total bigint
)
language plpgsql stable security definer set search_path = '' as $$
declare q text := nullif(trim(coalesce(p_q, '')), '');
begin
  perform public.require_admin();
  return query
  select m.id, m.kind, m.mime, m.caption, m.duration_s, m.storage_path, m.status, m.removed_by, m.removed_reason,
         m.created_at, m.user_id, pr.display_name, pr.status, p.id, p.name, p.city_id,
         (select count(*)::int from public.comments c where c.media_id = m.id),
         count(*) over ()
  from public.media m
  join public.profiles pr on pr.id = m.user_id
  join public.places p on p.id = m.place_id
  where m.status <> 'pending'
    and (p_status is null or m.status = p_status)
    and (q is null or m.caption ilike '%' || q || '%' or pr.display_name ilike '%' || q || '%' or p.name ilike '%' || q || '%')
  order by m.created_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100) offset greatest(coalesce(p_offset, 0), 0);
end $$;
revoke all on function public.admin_media(text, text, int, int) from public, anon;
grant execute on function public.admin_media(text, text, int, int) to authenticated;

create function public.admin_comments(
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
  join public.media m on m.id = c.media_id
  join public.places p on p.id = m.place_id
  where (p_status is null or c.status = p_status)
    and (q is null or c.body ilike '%' || q || '%' or pr.display_name ilike '%' || q || '%' or p.name ilike '%' || q || '%')
  order by c.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0);
end $$;
revoke all on function public.admin_comments(text, text, int, int) from public, anon;
grant execute on function public.admin_comments(text, text, int, int) to authenticated;

create function public.admin_set_media_status(p_media uuid, p_status text, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  admin uuid := public.require_admin();
  m public.media;
begin
  if p_status not in ('visible', 'removed') then raise exception 'bad status'; end if;
  if not public.valid_admin_reason(p_reason) then return jsonb_build_object('ok', false, 'reason', 'need_reason'); end if;
  select * into m from public.media where id = p_media for update;
  if not found or m.status = 'pending' then raise exception 'media not found'; end if;
  if m.status = p_status then return jsonb_build_object('ok', false, 'reason', 'no_change'); end if;
  update public.media
     set status = p_status,
         removed_by = case when p_status = 'removed' then 'admin' end,
         removed_reason = case when p_status = 'removed' then trim(p_reason) end
   where id = p_media;
  perform public.log_event_as(admin, 'admin',
    case when p_status = 'removed' then 'admin.media_remove' else 'admin.media_restore' end,
    'media', p_media::text,
    jsonb_build_object('reason', trim(p_reason), 'owner', m.user_id, 'place_id', m.place_id, 'previous_reason', m.removed_reason));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.admin_set_media_status(uuid, text, text) from public, anon;
grant execute on function public.admin_set_media_status(uuid, text, text) to authenticated;

create function public.admin_set_comment_status(p_comment uuid, p_status text, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  admin uuid := public.require_admin();
  c public.comments;
begin
  if p_status not in ('visible', 'removed') then raise exception 'bad status'; end if;
  if not public.valid_admin_reason(p_reason) then return jsonb_build_object('ok', false, 'reason', 'need_reason'); end if;
  select * into c from public.comments where id = p_comment for update;
  if not found then raise exception 'comment not found'; end if;
  if c.status = p_status then return jsonb_build_object('ok', false, 'reason', 'no_change'); end if;
  update public.comments
     set status = p_status,
         removed_by = case when p_status = 'removed' then 'admin' end,
         removed_reason = case when p_status = 'removed' then trim(p_reason) end
   where id = p_comment;
  perform public.log_event_as(admin, 'admin',
    case when p_status = 'removed' then 'admin.comment_remove' else 'admin.comment_restore' end,
    'comment', p_comment::text,
    jsonb_build_object('reason', trim(p_reason), 'owner', c.user_id, 'media_id', c.media_id, 'body', c.body));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.admin_set_comment_status(uuid, text, text) from public, anon;
grant execute on function public.admin_set_comment_status(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Audit log viewer: admins already read audit_log directly (RLS). This adds
-- the actor's display name and filters in one call.
-- ---------------------------------------------------------------------------
create function public.admin_audit_log(
  p_action text default null, p_actor text default null, p_target text default null,
  p_role text default null, p_from timestamptz default null, p_to timestamptz default null,
  p_before bigint default null, p_limit int default 50
) returns table (
  id bigint, at timestamptz, actor_id uuid, actor_name text, actor_role text, action text,
  target_type text, target_id text, details jsonb, hash text
)
language plpgsql stable security definer set search_path = '' as $$
declare
  act text := nullif(trim(coalesce(p_action, '')), '');
  who text := nullif(trim(coalesce(p_actor, '')), '');
  tgt text := nullif(trim(coalesce(p_target, '')), '');
begin
  perform public.require_admin();
  return query
  select a.id, a.at, a.actor_id, pr.display_name, a.actor_role, a.action, a.target_type, a.target_id, a.details, a.hash
  from public.audit_log a
  left join public.profiles pr on pr.id = a.actor_id
  where (act is null or a.action like act || '%')
    and (who is null or a.actor_id::text = who or pr.display_name ilike '%' || who || '%')
    and (tgt is null or a.target_id = tgt)
    and (p_role is null or a.actor_role = p_role)
    and (p_from is null or a.at >= p_from)
    and (p_to is null or a.at < p_to)
    and (p_before is null or a.id < p_before)
  order by a.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end $$;
revoke all on function public.admin_audit_log(text, text, text, text, timestamptz, timestamptz, bigint, int) from public, anon;
grant execute on function public.admin_audit_log(text, text, text, text, timestamptz, timestamptz, bigint, int) to authenticated;

/** Records that an admin checked the chain, with the result. */
create function public.admin_verify_audit_chain() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  admin uuid := public.require_admin();
  bad bigint := public.verify_audit_chain();
  n bigint := (select count(*) from public.audit_log);
begin
  perform public.log_event_as(admin, 'admin', 'admin.audit_verify', 'audit_log', null,
    jsonb_build_object('entries', n, 'intact', bad is null, 'first_bad_id', bad));
  return jsonb_build_object('intact', bad is null, 'first_bad_id', bad, 'entries', n);
end $$;
revoke all on function public.admin_verify_audit_chain() from public, anon;
grant execute on function public.admin_verify_audit_chain() to authenticated;
