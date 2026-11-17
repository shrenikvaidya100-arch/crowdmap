-- User 1: "Plan my visit": visit plans, special days, and an hourly forecast
-- that blends typical patterns, the place's own report history, holidays and plans.
-- Times are India time (Asia/Kolkata). Weather is applied by the app on top.

-- ---------------------------------------------------------------------------
-- Visit plans ("I'm planning to go at 6 pm"). Counts are public, people are not.
-- ---------------------------------------------------------------------------
create table public.visit_plans (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  place_id    uuid not null references public.places(id) on delete cascade,
  planned_for timestamptz not null check (date_trunc('hour', planned_for) = planned_for),
  created_at  timestamptz not null default now(),
  unique (user_id, place_id, planned_for)
);
create index visit_plans_place_idx on public.visit_plans (place_id, planned_for);
create index visit_plans_user_idx on public.visit_plans (user_id, planned_for);

alter table public.visit_plans enable row level security;
revoke all on public.visit_plans from anon, authenticated;
grant select, delete on public.visit_plans to authenticated;
create policy visit_plans_read_own on public.visit_plans for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy visit_plans_delete_own on public.visit_plans for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

create function public.visit_plans_audit_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.log_event_as(auth.uid(), case when public.is_admin() then 'admin' else 'user' end,
    'plan.cancel', 'visit_plan', old.id::text,
    jsonb_build_object('place_id', old.place_id, 'planned_for', old.planned_for));
  return old;
end $$;
create trigger visit_plans_audit_delete before delete on public.visit_plans
  for each row when (auth.uid() is not null) execute function public.visit_plans_audit_delete();

/** Adds a plan for the caller. p_at is rounded down to the hour; up to 7 days ahead; 10 upcoming plans max. */
create function public.plan_visit(p_place uuid, p_at timestamptz) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_active_user();
  slot timestamptz := date_trunc('hour', p_at);
  new_id uuid;
begin
  if not exists (select 1 from public.places where id = p_place and status <> 'removed') then
    return jsonb_build_object('ok', false, 'reason', 'unknown_place');
  end if;
  if slot < date_trunc('hour', now()) or slot > now() + interval '7 days' then
    return jsonb_build_object('ok', false, 'reason', 'bad_time');
  end if;
  if (select count(*) from public.visit_plans where user_id = uid and planned_for >= date_trunc('hour', now())) >= 10 then
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
revoke all on function public.plan_visit(uuid, timestamptz) from public, anon;
grant execute on function public.plan_visit(uuid, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Special days: holidays and festivals that change crowds.
-- Fixed-date days are seeded. Festivals that follow the lunar calendar
-- (Diwali, Holi, Ganesh Chaturthi, Eid, Navratri...) move every year: add them
-- with their confirmed dates, e.g. via scripts/user1/special-days.sql.
-- ---------------------------------------------------------------------------
create table public.special_days (
  day        date not null,
  name       text not null,
  name_hi    text,
  categories text[],          -- null = every category
  boost      real not null check (boost between -2 and 2),
  primary key (day, name)
);
alter table public.special_days enable row level security;
revoke all on public.special_days from anon, authenticated;
grant select on public.special_days to anon, authenticated;
create policy special_days_read on public.special_days for select to anon, authenticated using (true);

insert into public.special_days (day, name, name_hi, categories, boost) values
  ('2026-12-25', 'Christmas', 'क्रिसमस', '{mall,cafe,restaurant,religious,park,tourist,entertainment}', 1),
  ('2026-12-31', 'New Year''s Eve', 'नए साल की पूर्व संध्या', '{restaurant,cafe,street_food,mall,entertainment,tourist}', 1.5),
  ('2027-01-01', 'New Year''s Day', 'नया साल', '{temple,religious,park,tourist,mall}', 1),
  ('2027-01-14', 'Makar Sankranti', 'मकर संक्रांति', '{temple,park,market}', 1),
  ('2027-01-26', 'Republic Day', 'गणतंत्र दिवस', '{park,tourist,mall}', 1),
  ('2027-01-26', 'Republic Day (offices closed)', 'गणतंत्र दिवस (दफ़्तर बंद)', '{bank,government,education}', -2),
  ('2027-08-15', 'Independence Day', 'स्वतंत्रता दिवस', '{park,tourist,mall}', 1),
  ('2027-08-15', 'Independence Day (offices closed)', 'स्वतंत्रता दिवस (दफ़्तर बंद)', '{bank,government,education}', -2),
  ('2027-10-02', 'Gandhi Jayanti', 'गांधी जयंती', '{park,tourist}', 0.5),
  ('2027-10-02', 'Gandhi Jayanti (offices closed)', 'गांधी जयंती (दफ़्तर बंद)', '{bank,government,education}', -2),
  ('2027-12-25', 'Christmas', 'क्रिसमस', '{mall,cafe,restaurant,religious,park,tourist,entertainment}', 1),
  ('2027-12-31', 'New Year''s Eve', 'नए साल की पूर्व संध्या', '{restaurant,cafe,street_food,mall,entertainment,tourist}', 1.5);

-- ---------------------------------------------------------------------------
-- Hourly forecast for one place and one (India) date.
-- level = typical pattern, pulled toward the place's own history for that
-- weekday and hour (more reports, more weight), + special day, + plans.
-- ---------------------------------------------------------------------------
create function public.forecast_day(p_place uuid, p_date date) returns jsonb
language sql stable security definer set search_path = '' as $$
  with p as (
    select id, category from public.places where id = p_place and status <> 'removed'
  ), hours as (
    select h, ((p_date + make_interval(hours => h))::timestamp at time zone 'Asia/Kolkata') as ts
    from generate_series(0, 23) h
  ), hist as (
    select extract(hour from r.created_at at time zone 'Asia/Kolkata')::int as h,
           avg(r.level)::real as level, count(*)::int as n
    from public.crowd_reports r
    where r.place_id = p_place and not r.is_sample
      and r.created_at > now() - interval '56 days'
      and extract(isodow from r.created_at at time zone 'Asia/Kolkata') = extract(isodow from p_date)
    group by 1
  ), special as (
    select coalesce(sum(s.boost), 0)::real as boost,
           array_agg(jsonb_build_object('name', s.name, 'name_hi', s.name_hi, 'boost', s.boost)) as days
    from public.special_days s, p
    where s.day = p_date and (s.categories is null or p.category = any(s.categories))
  ), plans as (
    select v.planned_for, count(*)::int as n from public.visit_plans v
    where v.place_id = p_place and v.planned_for >= (select min(ts) from hours) and v.planned_for <= (select max(ts) from hours)
    group by 1
  ), calc as (
    select hours.h, hours.ts,
      public.estimated_level(p.id, p.category, hours.ts) as base,
      hist.level as hist_level, coalesce(hist.n, 0) as hist_n,
      coalesce(plans.n, 0) as plans
    from hours cross join p
    left join hist on hist.h = hours.h
    left join plans on plans.planned_for = hours.ts
  )
  select jsonb_build_object(
    'date', p_date,
    'special', coalesce((select to_jsonb(days) from special where days is not null), '[]'::jsonb),
    'hours', coalesce(jsonb_agg(jsonb_build_object(
      'hour', c.h, 'at', c.ts,
      'level', greatest(1, least(5,
                 c.base * (1 - c.hist_n / (c.hist_n + 5.0))
                 + coalesce(c.hist_level, 0) * (c.hist_n / (c.hist_n + 5.0))
                 + (select boost from special)
                 + least(1.5, c.plans / 10.0)))::real,
      'base', c.base, 'history_reports', c.hist_n, 'plans', c.plans) order by c.h), '[]'::jsonb))
  from calc c;
$$;
revoke all on function public.forecast_day(uuid, date) from public;
grant execute on function public.forecast_day(uuid, date) to anon, authenticated;

/** The caller's upcoming plans (for the panel and My activity). */
create function public.my_upcoming_plans() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', v.id, 'place_id', v.place_id, 'name', p.name, 'name_hi', p.name_hi, 'planned_for', v.planned_for)
    order by v.planned_for), '[]'::jsonb)
  from public.visit_plans v join public.places p on p.id = v.place_id
  where v.user_id = auth.uid() and v.planned_for >= date_trunc('hour', now());
$$;
revoke all on function public.my_upcoming_plans() from public, anon;
grant execute on function public.my_upcoming_plans() to authenticated;
