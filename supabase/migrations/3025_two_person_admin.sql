-- Two-person rule, faster and visible to admins:
-- * ask_nearby_for_place(): asks people at a place (sharing location, or a GPS check,
--   within 400 m in the last 15 minutes) to confirm its waiting report, never the
--   reporter, at most once per person per place per 45 minutes; sends the pushes.
-- * Every 5 seconds a sweep asks people who arrived after the report was made
--   (the insert trigger only caught people who were there at that moment).
-- * Admins see the waiting reports and the confirmed pairs (who reported what, when),
--   can push the "please confirm" question to people nearby, and can send themselves
--   a test notification.

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('place_quiet', 'watch_expired', 'confirm_crowd', 'admin_test'));

/** Asks people near a place to confirm; returns how many were asked. */
create or replace function public.ask_nearby_for_place(p_place uuid, p_level int) returns int
language plpgsql security definer set search_path = '' as $$
declare
  p record;
  asked int := 0;
  pushes int := 0;
begin
  select id, name, name_hi, city_id, location into p from public.places where id = p_place;
  if not found then return 0; end if;
  with near as (
    select pr.user_id from public.presence pr
    where pr.updated_at > now() - interval '15 minutes'
      and extensions.st_dwithin(p.location, extensions.st_setsrid(extensions.st_makepoint(pr.lng, pr.lat), 4326)::extensions.geography, 400)
    union
    select c.user_id from public.location_checks c
    where c.accepted and c.at > now() - interval '15 minutes'
      and extensions.st_dwithin(p.location, extensions.st_setsrid(extensions.st_makepoint(c.lng, c.lat), 4326)::extensions.geography, 400)
  ), who as (
    select distinct n.user_id from near n
    join public.profiles u on u.id = n.user_id and u.status = 'active'
    where not exists (select 1 from public.crowd_reports r where r.place_id = p_place and r.user_id = n.user_id
                        and r.created_at > now() - interval '45 minutes')
      and not exists (select 1 from public.notifications x where x.user_id = n.user_id and x.kind = 'confirm_crowd'
                        and x.place_id = p_place and x.created_at > now() - interval '45 minutes')
    limit 50
  ), ins as (
    insert into public.notifications (user_id, kind, place_id, data, push_status)
    select w.user_id, 'confirm_crowd', p_place,
           jsonb_build_object('place_name', p.name, 'place_name_hi', p.name_hi, 'city_id', p.city_id, 'level', p_level),
           case when exists (select 1 from public.push_subscriptions s where s.user_id = w.user_id) then 'pending' else 'none' end
    from who w
    returning push_status
  )
  select count(*), count(*) filter (where push_status = 'pending') into asked, pushes from ins;
  if pushes > 0 then
    begin perform public.dispatch_pushes(); exception when others then null; end;
  end if;
  return asked;
end $$;
revoke all on function public.ask_nearby_for_place(uuid, int) from public, anon, authenticated;

/** The report trigger now uses the shared function. */
create or replace function public.ask_nearby_to_confirm() returns trigger
language plpgsql security definer set search_path = '' as $$
declare people int;
begin
  if new.is_sample or new.user_id is null then return new; end if;
  select count(distinct r.user_id) into people from public.crowd_reports r
  where r.place_id = new.place_id and not r.is_sample and r.created_at > now() - interval '45 minutes';
  if people <> 1 then return new; end if;
  perform public.ask_nearby_for_place(new.place_id, new.level);
  return new;
end $$;
revoke all on function public.ask_nearby_to_confirm() from public, anon, authenticated;

/** Every 5 seconds: places still waiting for a second person ask anyone newly nearby. */
create or replace function public.confirm_sweep() returns int
language plpgsql security definer set search_path = '' as $$
declare
  w record;
  total int := 0;
begin
  for w in
    select r.place_id, (array_agg(r.level order by r.created_at desc))[1] as level
    from public.crowd_reports r
    where not r.is_sample and r.created_at > now() - interval '45 minutes'
    group by r.place_id
    having count(distinct r.user_id) = 1
  loop
    total := total + public.ask_nearby_for_place(w.place_id, w.level);
  end loop;
  -- Anything still waiting to be pushed (e.g. a send that failed) goes out too.
  if exists (select 1 from public.notifications where push_status = 'pending') then
    begin perform public.dispatch_pushes(); exception when others then null; end;
  end if;
  return total;
end $$;
revoke all on function public.confirm_sweep() from public, anon, authenticated;

do $$ begin
  perform cron.unschedule('crowdmap-confirm-sweep');
exception when others then null; end $$;
select cron.schedule('crowdmap-confirm-sweep', '5 seconds', 'select public.confirm_sweep()');

/** Admin: reports from the last 3 hours grouped by place, with the two-person status. */
create or replace function public.admin_two_person(p_hours int default 3) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_admin();
  return coalesce((
    select jsonb_agg(x order by x->>'last_at' desc) from (
      select jsonb_build_object(
        'place_id', p.id, 'place', p.name, 'city', c.name,
        'people', count(distinct r.user_id),
        'status', case when count(distinct r.user_id) filter (where r.created_at > now() - interval '90 minutes') >= 2 then 'confirmed'
                       when max(r.created_at) > now() - interval '45 minutes' then 'waiting' else 'expired' end,
        'last_at', max(r.created_at),
        'asked', (select count(*) from public.notifications n where n.kind = 'confirm_crowd' and n.place_id = p.id
                    and n.created_at > now() - interval '45 minutes'),
        'nearby', (select count(*) from public.presence pr where pr.updated_at > now() - interval '15 minutes'
                    and extensions.st_dwithin(p.location, extensions.st_setsrid(extensions.st_makepoint(pr.lng, pr.lat), 4326)::extensions.geography, 400)),
        'entries', jsonb_agg(jsonb_build_object(
            'name', coalesce(u.display_name, 'Sample'), 'level', r.level, 'at', r.created_at,
            'distance_m', round(coalesce(r.distance_m, 0)), 'sample', r.is_sample)
          order by r.created_at)
      ) as x
      from public.crowd_reports r
      join public.places p on p.id = r.place_id
      left join public.cities c on c.id = p.city_id
      left join public.profiles u on u.id = r.user_id
      where r.created_at > now() - make_interval(hours => least(greatest(p_hours, 1), 48))
      group by p.id, p.name, c.name, p.location
      limit 100
    ) t
  ), '[]'::jsonb);
end $$;
revoke all on function public.admin_two_person(int) from public, anon;
grant execute on function public.admin_two_person(int) to authenticated;

/** Admin: push "is it crowded?" to people near a place now. */
create or replace function public.admin_push_confirm(p_place uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  admin uuid := public.require_admin();
  lvl int;
  n int;
begin
  select r.level into lvl from public.crowd_reports r where r.place_id = p_place order by r.created_at desc limit 1;
  n := public.ask_nearby_for_place(p_place, coalesce(lvl, 3));
  perform public.log_event_as(admin, 'admin', 'admin.push_confirm', 'place', p_place::text, jsonb_build_object('asked', n));
  return jsonb_build_object('ok', true, 'asked', n);
end $$;
revoke all on function public.admin_push_confirm(uuid) from public, anon;
grant execute on function public.admin_push_confirm(uuid) to authenticated;

/** Admin: a test notification to my own devices. */
create or replace function public.admin_test_push() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  admin uuid := public.require_admin();
  devices int;
begin
  select count(*) into devices from public.push_subscriptions where user_id = admin;
  insert into public.notifications (user_id, kind, place_id, data, push_status)
  values (admin, 'admin_test', null, '{}'::jsonb, case when devices > 0 then 'pending' else 'none' end);
  if devices > 0 then
    begin perform public.dispatch_pushes(); exception when others then null; end;
  end if;
  return jsonb_build_object('ok', true, 'devices', devices);
end $$;
revoke all on function public.admin_test_push() from public, anon;
grant execute on function public.admin_test_push() to authenticated;

-- The 5-second job logs every run: keep a day of run history.
do $$ begin
  perform cron.unschedule('crowdmap-cron-log-trim');
exception when others then null; end $$;
select cron.schedule('crowdmap-cron-log-trim', '41 * * * *', $$delete from cron.job_run_details where end_time < now() - interval '1 day'$$);
