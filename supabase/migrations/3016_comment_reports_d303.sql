-- Report a comment (like reporting an upload); admins see reported comments in a
-- queue and remove or keep them. Also the D-303 classroom on the IIM Indore
-- campus (D-Block), for the class demo.

create table public.comment_reports (
  id          bigint generated always as identity primary key,
  comment_id  uuid not null references public.comments(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  reason      text not null check (reason in ('inappropriate', 'not_this_place', 'private_info', 'spam', 'other')),
  status      text not null default 'open' check (status in ('open', 'dismissed', 'removed')),
  created_at  timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  unique (comment_id, user_id)
);
create index comment_reports_open_idx on public.comment_reports (comment_id) where status = 'open';
alter table public.comment_reports enable row level security;
revoke all on public.comment_reports from anon, authenticated;
-- Reporters can see their own reports; everything else goes through the functions below.
grant select on public.comment_reports to authenticated;
create policy comment_reports_own on public.comment_reports for select to authenticated using (user_id = auth.uid());

create function public.report_comment(p_comment uuid, p_reason text default 'inappropriate') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_active_user();
begin
  if not exists (select 1 from public.comments where id = p_comment and status = 'visible') then raise exception 'comment not found'; end if;
  if exists (select 1 from public.comments where id = p_comment and user_id = uid) then
    return jsonb_build_object('ok', false, 'reason', 'own_comment');
  end if;
  if (select count(*) from public.comment_reports where user_id = uid and created_at > now() - interval '1 day') >= 20 then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;
  insert into public.comment_reports (comment_id, user_id, reason) values (p_comment, uid, coalesce(p_reason, 'inappropriate'))
  on conflict (comment_id, user_id) do nothing;
  if not found then return jsonb_build_object('ok', false, 'reason', 'already_reported'); end if;
  perform public.log_event_as(uid, 'user', 'comment.report', 'comment', p_comment::text, jsonb_build_object('reason', p_reason));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.report_comment(uuid, text) from public, anon;
grant execute on function public.report_comment(uuid, text) to authenticated;

create function public.admin_comment_report_queue()
returns table (comment_id uuid, body text, author text, place_name text, reports int, reasons text[], first_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_admin();
  return query
  select c.id, c.body, pr.display_name, p.name, count(r.id)::int, array_agg(distinct r.reason), min(r.created_at)
  from public.comment_reports r
  join public.comments c on c.id = r.comment_id
  join public.profiles pr on pr.id = c.user_id
  join public.media m on m.id = c.media_id
  join public.places p on p.id = m.place_id
  where r.status = 'open' and c.status = 'visible'
  group by c.id, c.body, pr.display_name, p.name
  order by count(r.id) desc, min(r.created_at)
  limit 100;
end $$;
revoke all on function public.admin_comment_report_queue() from public, anon;
grant execute on function public.admin_comment_report_queue() to authenticated;

/** Admin decision on a reported comment: remove it (logged with the reason) or keep it. */
create function public.admin_resolve_comment_reports(p_comment uuid, p_action text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_admin();
begin
  if p_action not in ('keep', 'remove') then raise exception 'unknown action'; end if;
  if p_action = 'remove' then
    perform public.admin_set_comment_status(p_comment, 'removed', 'Removed after a report');
  end if;
  update public.comment_reports set status = case when p_action = 'remove' then 'removed' else 'dismissed' end,
         reviewed_by = uid, reviewed_at = now()
  where comment_id = p_comment and status = 'open';
  perform public.log_event_as(uid, 'admin', 'admin.comment_reports', 'comment', p_comment::text, jsonb_build_object('action', p_action));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.admin_resolve_comment_reports(uuid, text) from public, anon;
grant execute on function public.admin_resolve_comment_reports(uuid, text) to authenticated;

-- D-303 classroom (D-Block, IIM Indore). Category "other" so a handful of people
-- sharing location there already counts (5 per crowd step); radius covers the block,
-- since phone GPS indoors is rough.
insert into public.places (city_id, name, category, lat, lng, radius_m, address)
select 'indore', 'D-303 Classroom', 'other', 22.627649, 75.791533, 80, 'Classroom, D-Block, IIM Indore campus, Rau-Pithampur Road, Indore 453556'
where not exists (select 1 from public.places where city_id = 'indore' and name = 'D-303 Classroom');
