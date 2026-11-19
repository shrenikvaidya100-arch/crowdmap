-- Demo fixes:
-- * Admins can clear the crowd inputs at a place straight from the map (recent
--   reports, active alerts and the people counted there) and delete a single alert.
--   Both are logged; viewers get a live update.
-- * People can clear their own notifications.
-- * Every place now rises one level per 3 people sharing location there
--   (3 = Moderate, 6 = Busy, 9+ = Packed), not 4 or 6 for some kinds of place.
-- * A guest who stops sharing now updates the map straight away, like a signed-in person.

create or replace function public.presence_floor(p_category text, p_here int) returns int
language sql immutable set search_path = '' as $$
  select case when p_here >= 3 then least(5, 2 + p_here / 3)::int else null end;
$$;

create or replace function public.stop_presence_anon(p_device uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare prev public.anon_presence;
begin
  delete from public.anon_presence where device_id = p_device returning * into prev;
  if prev.place_id is not null then
    begin perform public.notify_city(prev.city_id, prev.place_id, 'presence'); exception when others then null; end;
  end if;
end $$;
revoke all on function public.stop_presence_anon(uuid) from public;
grant execute on function public.stop_presence_anon(uuid) to anon, authenticated;

/** Deletes all of my notifications. */
create function public.clear_my_notifications() returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  delete from public.notifications where user_id = auth.uid();
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.clear_my_notifications() from public, anon;
grant execute on function public.clear_my_notifications() to authenticated;

/** Admin: clear a place's crowd inputs (reports from the last 3 hours, active alerts, people counted there). */
create function public.admin_clear_place_inputs(p_place uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  admin uuid := public.require_admin();
  pl public.places;
  n_reports int; n_alerts int; n_people int; n_guests int;
begin
  select * into pl from public.places where id = p_place;
  if not found then raise exception 'place not found'; end if;
  delete from public.crowd_reports where place_id = p_place and created_at > now() - interval '3 hours';
  get diagnostics n_reports = row_count;
  delete from public.quick_reports where place_id = p_place and expires_at > now();
  get diagnostics n_alerts = row_count;
  delete from public.presence where place_id = p_place;
  get diagnostics n_people = row_count;
  delete from public.anon_presence where place_id = p_place;
  get diagnostics n_guests = row_count;
  perform public.log_event_as(admin, 'admin', 'admin.place_clear', 'place', p_place::text,
    jsonb_build_object('name', pl.name, 'reports', n_reports, 'alerts', n_alerts, 'people', n_people + n_guests));
  perform public.notify_city(pl.city_id, p_place, 'admin');
  return jsonb_build_object('ok', true, 'reports', n_reports, 'alerts', n_alerts, 'people', n_people + n_guests);
end $$;
revoke all on function public.admin_clear_place_inputs(uuid) from public, anon;
grant execute on function public.admin_clear_place_inputs(uuid) to authenticated;

/** Admin: delete one alert pin. */
create function public.admin_delete_alert(p_alert uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  admin uuid := public.require_admin();
  q public.quick_reports;
begin
  delete from public.quick_reports where id = p_alert returning * into q;
  if q.id is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  perform public.log_event_as(admin, 'admin', 'admin.alert_delete', 'quick_report', p_alert::text,
    jsonb_build_object('kind', q.kind, 'place_id', q.place_id, 'owner', q.user_id));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.admin_delete_alert(uuid) from public, anon;
grant execute on function public.admin_delete_alert(uuid) to authenticated;
