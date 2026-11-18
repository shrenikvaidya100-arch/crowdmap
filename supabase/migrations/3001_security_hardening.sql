-- Review round 1: security hardening.

-- 1. The app only writes a few audit actions itself; everything else is logged by
--    database functions. Visitors who aren't logged in could call log_event and
--    fill the log (and the free 500 MB database) with fake entries; signed-in
--    users could write arbitrary action names under their own id. Now: signed-in
--    only, a fixed list of actions, at most 30 a minute per user.
create or replace function public.log_event(
  p_action text, p_target_type text default null, p_target_id text default null,
  p_details jsonb default '{}'
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  uid  uuid := auth.uid();
  role text;
  new_id bigint;
begin
  if uid is null then raise exception 'not signed in'; end if;
  role := case when public.is_admin() then 'admin' else 'user' end;
  if p_action not in ('auth.login', 'auth.logout', 'auth.login_blocked', 'quick.delete') then
    raise exception 'action not allowed from the app: %', p_action;
  end if;
  if (select count(*) from public.audit_log
      where actor_id = uid and at > now() - interval '1 minute' and action = p_action) >= 30 then
    raise exception 'too many log entries';
  end if;
  insert into public.audit_log (actor_id, actor_role, action, target_type, target_id, details, prev_hash, hash)
  values (uid, role, p_action, p_target_type, p_target_id, coalesce(p_details, '{}'), '', '')
  returning id into new_id;
  return new_id;
end $$;
revoke all on function public.log_event(text, text, text, jsonb) from public, anon;
grant execute on function public.log_event(text, text, text, jsonb) to authenticated;

-- 2. Trigger functions and per-user readers don't need to be callable by visitors.
--    (Triggers keep working: EXECUTE is only checked when a trigger is created.)
do $$
declare f text;
begin
  foreach f in array array[
    'audit_log_chain()', 'audit_profiles()', 'broadcast_crowd_change()', 'crowd_reports_audit()',
    'enforce_admin_cap()', 'handle_new_user()', 'visit_plans_audit_delete()', 'touch_updated_at()',
    'audit_log_immutable()', 'my_comments()'
  ] loop
    if to_regprocedure('public.' || f) is not null then
      execute format('revoke all on function public.%s from public, anon', f);
    end if;
  end loop;
end $$;
grant execute on function public.my_comments() to authenticated;

-- 3. user_trust listed every account id with its trust score for any signed-in
--    user. Nothing in the app reads it; keep it for admins and database functions.
revoke select on public.user_trust from authenticated;

-- 4. Display names are shown publicly next to uploads and comments: no links.
alter table public.profiles add constraint profiles_display_name_no_links
  check (display_name !~* '(https?:|www\.|\.com\b)');

-- 5. Visit plans: at most 10 upcoming was already enforced, but creating and
--    cancelling in a loop was unlimited (each one is an audit entry).
create function public.visit_plans_rate_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.audit_log
      where actor_id = new.user_id and action = 'plan.create' and at > now() - interval '1 day') >= 40 then
    raise exception 'too many plans today';
  end if;
  return new;
end $$;
revoke all on function public.visit_plans_rate_limit() from public, anon, authenticated;
create trigger visit_plans_rate_limit before insert on public.visit_plans
  for each row execute function public.visit_plans_rate_limit();

-- 6. Indexes for foreign keys used in lookups and cascading deletes.
create index if not exists quick_reports_user_idx on public.quick_reports (user_id);
create index if not exists quick_reports_kind_idx on public.quick_reports (kind);
create index if not exists places_added_by_idx on public.places (added_by) where added_by is not null;
create index if not exists location_checks_place_idx on public.location_checks (place_id) where place_id is not null;
create index if not exists quick_report_votes_user_idx on public.quick_report_votes (user_id);
create index if not exists place_confirmations_user_idx on public.place_confirmations (user_id);
create index if not exists presence_city_idx on public.presence (city_id);
create index if not exists profiles_home_city_idx on public.profiles (home_city) where home_city is not null;
create index if not exists bot_flags_reviewed_by_idx on public.bot_flags (reviewed_by) where reviewed_by is not null;
create index if not exists audit_log_actor_at_idx on public.audit_log (actor_id, at desc);
create index if not exists audit_log_target_idx on public.audit_log (target_id, action);
