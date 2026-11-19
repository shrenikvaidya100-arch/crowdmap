-- "Is it crowded? Please confirm": when a place gets its first crowd report (the one
-- that waits for a second person), people who are at that place right now get a
-- notification (and a push, if they allowed it) asking them to confirm.
-- "At the place right now" = sharing live location within 400 m in the last 15
-- minutes, or a GPS check accepted within 400 m in the last 15 minutes.
-- Never the reporter; at most one such notification per person per place per 45 min.

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('place_quiet', 'watch_expired', 'confirm_crowd'));

create or replace function public.ask_nearby_to_confirm() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  p record;
  people int;
  asked int;
begin
  if new.is_sample or new.user_id is null then return new; end if;
  -- Only while the report is waiting for a second person.
  select count(distinct r.user_id) into people from public.crowd_reports r
  where r.place_id = new.place_id and not r.is_sample and r.created_at > now() - interval '45 minutes';
  if people <> 1 then return new; end if;

  select id, name, name_hi, city_id, location into p from public.places where id = new.place_id;
  if not found then return new; end if;

  with near as (
    select pr.user_id from public.presence pr
    where pr.updated_at > now() - interval '15 minutes'
      and extensions.st_dwithin(p.location, extensions.st_setsrid(extensions.st_makepoint(pr.lng, pr.lat), 4326)::extensions.geography, 400)
    union
    select c.user_id from public.location_checks c
    where c.accepted and c.at > now() - interval '15 minutes'
      and extensions.st_dwithin(p.location, extensions.st_setsrid(extensions.st_makepoint(c.lng, c.lat), 4326)::extensions.geography, 400)
  ), who as (
    select n.user_id from near n
    join public.profiles u on u.id = n.user_id and u.status = 'active'
    where n.user_id <> new.user_id
      and not exists (select 1 from public.notifications x where x.user_id = n.user_id and x.kind = 'confirm_crowd'
                      and x.place_id = new.place_id and x.created_at > now() - interval '45 minutes')
    limit 20
  ), ins as (
    insert into public.notifications (user_id, kind, place_id, data, push_status)
    select w.user_id, 'confirm_crowd', new.place_id,
           jsonb_build_object('place_name', p.name, 'place_name_hi', p.name_hi, 'city_id', p.city_id, 'level', new.level),
           case when exists (select 1 from public.push_subscriptions s where s.user_id = w.user_id) then 'pending' else 'none' end
    from who w
    returning push_status
  )
  select count(*) filter (where push_status = 'pending') into asked from ins;
  if asked > 0 then
    begin
      perform public.dispatch_pushes();
    exception when others then null; -- pushes also go out with the next 2-minute check
    end;
  end if;
  return new;
end $$;
revoke all on function public.ask_nearby_to_confirm() from public, anon, authenticated;

drop trigger if exists crowd_reports_ask_nearby on public.crowd_reports;
create trigger crowd_reports_ask_nearby after insert on public.crowd_reports
  for each row execute function public.ask_nearby_to_confirm();
