-- Review round 3: people can delete their own account.
-- The server calls this first (as the user): it logs the deletion with what is
-- being removed and returns the user's stored files. The server then deletes
-- the files and the login (auth user); everything else cascades. Audit-log
-- entries stay (append-only by design). Admins must step down first, so the
-- site is never left without its admins by accident.
create function public.begin_account_deletion() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_active_user();
  counts jsonb;
  paths text[];
begin
  if public.is_admin() then return jsonb_build_object('ok', false, 'reason', 'admin'); end if;
  select jsonb_build_object(
      'reports', (select count(*) from public.crowd_reports where user_id = uid),
      'alerts', (select count(*) from public.quick_reports where user_id = uid),
      'uploads', (select count(*) from public.media where user_id = uid),
      'comments', (select count(*) from public.comments where user_id = uid),
      'plans', (select count(*) from public.visit_plans where user_id = uid),
      'places_added', (select count(*) from public.places where added_by = uid))
    into counts;
  select coalesce(array_agg(storage_path), '{}') into paths from public.media where user_id = uid;
  perform public.log_event_as(uid, 'user', 'account.delete', 'profile', uid::text, counts);
  return jsonb_build_object('ok', true, 'paths', to_jsonb(paths));
end $$;
revoke all on function public.begin_account_deletion() from public, anon;
grant execute on function public.begin_account_deletion() to authenticated;
