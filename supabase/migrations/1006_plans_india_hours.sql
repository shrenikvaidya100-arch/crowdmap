-- User 1: visit plans are whole hours in India time (UTC+5:30), so they line up
-- with the forecast's hours. 1005 rounded to UTC hours, which are :30 in India.

delete from public.visit_plans
where date_trunc('hour', planned_for at time zone 'Asia/Kolkata') <> (planned_for at time zone 'Asia/Kolkata');

alter table public.visit_plans drop constraint visit_plans_planned_for_check;
alter table public.visit_plans add constraint visit_plans_planned_for_india_hour check (
  date_trunc('hour', planned_for at time zone 'Asia/Kolkata') = (planned_for at time zone 'Asia/Kolkata'));

create or replace function public.plan_visit(p_place uuid, p_at timestamptz) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_active_user();
  -- Round down to the hour in India time.
  slot timestamptz := date_trunc('hour', p_at at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
  this_hour timestamptz := date_trunc('hour', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
  new_id uuid;
begin
  if not exists (select 1 from public.places where id = p_place and status <> 'removed') then
    return jsonb_build_object('ok', false, 'reason', 'unknown_place');
  end if;
  if slot < this_hour or slot > now() + interval '7 days' then
    return jsonb_build_object('ok', false, 'reason', 'bad_time');
  end if;
  if (select count(*) from public.visit_plans where user_id = uid and planned_for >= this_hour) >= 10 then
    return jsonb_build_object('ok', false, 'reason', 'too_many_plans');
  end if;
  insert into public.visit_plans (user_id, place_id, planned_for) values (uid, p_place, slot)
    on conflict (user_id, place_id, planned_for) do nothing
    returning id into new_id;
  if new_id is null then return jsonb_build_object('ok', false, 'reason', 'already_planned'); end if;
  perform public.log_event_as(uid, 'user', 'plan.create', 'visit_plan', new_id::text,
    jsonb_build_object('place_id', p_place, 'planned_for', slot));
  return jsonb_build_object('ok', true, 'id', new_id);
end $$;
