-- User 1: crowd reports, quick reports, location checks and crowd levels.
-- Thresholds here must match src/features/crowd/config.ts.
--   max GPS accuracy 75 m · max sample spread 100 m · impossible travel > 200 km/h over > 2 km
--   one crowd report per place per 10 min · 30 location-checked actions per hour
--   reports fade with a 30 min half-life-ish weight and count for 90 min

-- ---------------------------------------------------------------------------
-- Location checks: every GPS-verified action, accepted or not. User 2's bot
-- detection reads this (see docs/CONTRACTS.md).
-- ---------------------------------------------------------------------------
create table public.location_checks (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  at         timestamptz not null default now(),
  lat        double precision not null check (lat between -90 and 90),
  lng        double precision not null check (lng between -180 and 180),
  accuracy_m real not null,
  spread_m   real,
  place_id   uuid references public.places(id) on delete set null,
  distance_m real,
  speed_kmh  real,
  source     text not null check (source in ('crowd_report', 'quick_report', 'quick_vote', 'presence')),
  accepted   boolean not null,
  reason     text
);
create index location_checks_user_idx on public.location_checks (user_id, at desc);

alter table public.location_checks enable row level security;
revoke all on public.location_checks from anon, authenticated;
grant select on public.location_checks to authenticated;
create policy location_checks_read on public.location_checks for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- Crowd reports (the 5-level scale)
-- ---------------------------------------------------------------------------
create table public.crowd_reports (
  id         uuid primary key default gen_random_uuid(),
  place_id   uuid not null references public.places(id) on delete cascade,
  user_id    uuid references public.profiles(id) on delete cascade,
  level      smallint not null check (level between 1 and 5),
  lat        double precision,
  lng        double precision,
  accuracy_m real,
  distance_m real,
  is_sample  boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (is_sample or user_id is not null)
);
create index crowd_reports_place_idx on public.crowd_reports (place_id, created_at desc);
create index crowd_reports_user_idx on public.crowd_reports (user_id, created_at desc);

alter table public.crowd_reports enable row level security;
revoke all on public.crowd_reports from anon, authenticated;
grant select, delete on public.crowd_reports to authenticated;
grant update (level) on public.crowd_reports to authenticated;
create policy crowd_reports_read on public.crowd_reports for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
-- A report can be corrected for 15 minutes after it was made.
create policy crowd_reports_update_own on public.crowd_reports for update to authenticated
  using (user_id = auth.uid() and created_at > now() - interval '15 minutes')
  with check (user_id = auth.uid());
create policy crowd_reports_delete_own on public.crowd_reports for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

create function public.crowd_reports_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare actor_role text := case when public.is_admin() then 'admin' else 'user' end;
begin
  if tg_op = 'UPDATE' then
    new.updated_at := now();
    perform public.log_event_as(auth.uid(), actor_role, 'crowd.report_update', 'crowd_report', new.id::text,
      jsonb_build_object('place_id', new.place_id, 'from', old.level, 'to', new.level));
    return new;
  end if;
  perform public.log_event_as(auth.uid(), actor_role, 'crowd.report_delete', 'crowd_report', old.id::text,
    jsonb_build_object('place_id', old.place_id, 'level', old.level));
  return old;
end $$;
create trigger crowd_reports_audit_update before update on public.crowd_reports
  for each row when (auth.uid() is not null) execute function public.crowd_reports_audit();
create trigger crowd_reports_audit_delete before delete on public.crowd_reports
  for each row when (auth.uid() is not null) execute function public.crowd_reports_audit();

-- ---------------------------------------------------------------------------
-- Quick reports (one-tap alerts) and votes on them
-- ---------------------------------------------------------------------------
create table public.quick_report_kinds (
  kind         text primary key,
  ttl_minutes  int not null,
  crowd_effect smallint not null default 0 -- nudges the live level
);
insert into public.quick_report_kinds values
  ('long_queue', 60, 1), ('police', 90, 0), ('road_blocked', 120, 0), ('waterlogging', 180, 0),
  ('accident', 60, 0), ('parking_full', 90, 1), ('closed', 240, 0), ('procession', 120, 1),
  ('construction', 1440, 0), ('power_cut', 120, 0), ('festival_rush', 180, 1), ('no_wait', 45, -1);
alter table public.quick_report_kinds enable row level security;
revoke all on public.quick_report_kinds from anon, authenticated;
grant select on public.quick_report_kinds to anon, authenticated;
create policy quick_report_kinds_read on public.quick_report_kinds for select to anon, authenticated using (true);

create table public.quick_reports (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles(id) on delete cascade,
  kind        text not null references public.quick_report_kinds(kind),
  place_id    uuid references public.places(id) on delete cascade,
  city_id     text references public.cities(id),
  lat         double precision not null,
  lng         double precision not null,
  still_there int not null default 0,
  gone        int not null default 0,
  is_sample   boolean not null default false,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  check (is_sample or user_id is not null)
);
create index quick_reports_active_idx on public.quick_reports (city_id, expires_at desc);
create index quick_reports_place_idx on public.quick_reports (place_id, expires_at desc);

alter table public.quick_reports enable row level security;
revoke all on public.quick_reports from anon, authenticated;
grant select (id, kind, place_id, city_id, lat, lng, still_there, gone, is_sample, created_at, expires_at)
  on public.quick_reports to anon, authenticated;
grant select (user_id) on public.quick_reports to authenticated;
grant delete on public.quick_reports to authenticated;
create policy quick_reports_read on public.quick_reports for select to anon, authenticated
  using (expires_at > now() or user_id = auth.uid() or public.is_admin());
create policy quick_reports_delete_own on public.quick_reports for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

create table public.quick_report_votes (
  report_id   uuid not null references public.quick_reports(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  still_there boolean not null,
  created_at  timestamptz not null default now(),
  primary key (report_id, user_id)
);
alter table public.quick_report_votes enable row level security;
revoke all on public.quick_report_votes from anon, authenticated;
grant select on public.quick_report_votes to authenticated;
create policy quick_report_votes_read on public.quick_report_votes for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- Location verification shared by all GPS-checked actions
-- ---------------------------------------------------------------------------
create function public.check_location(
  p_user uuid, p_lat double precision, p_lng double precision, p_accuracy real,
  p_spread real, p_place uuid, p_max_distance real, p_source text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  pt extensions.geography := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;
  prev public.location_checks;
  dist real;
  speed real;
  reason text;
  allowed real;
begin
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    reason := 'bad_location';
  elsif p_accuracy is null or p_accuracy > 75 then
    reason := 'low_accuracy';
  elsif coalesce(p_spread, 0) > 100 then
    reason := 'unstable_location';
  elsif (select count(*) from public.location_checks
         where user_id = p_user and at > now() - interval '1 hour') >= 30 then
    reason := 'rate_limited';
  end if;

  if p_place is not null then
    select extensions.st_distance(location, pt), radius_m + least(coalesce(p_accuracy, 0), 50)
      into dist, allowed from public.places where id = p_place and status <> 'removed';
    if dist is null then reason := coalesce(reason, 'unknown_place');
    elsif dist > allowed then reason := coalesce(reason, 'not_at_place');
    end if;
  elsif p_max_distance is not null then
    allowed := p_max_distance;
  end if;

  select * into prev from public.location_checks
    where user_id = p_user and at > now() - interval '2 hours' order by at desc limit 1;
  if found then
    declare
      km real := extensions.st_distance(
        extensions.st_setsrid(extensions.st_makepoint(prev.lng, prev.lat), 4326)::extensions.geography, pt) / 1000;
      hours real := greatest(extract(epoch from now() - prev.at) / 3600, 1.0 / 3600);
    begin
      speed := km / hours;
      if km > 2 and speed > 200 then reason := coalesce(reason, 'impossible_travel'); end if;
    end;
  end if;

  insert into public.location_checks (user_id, lat, lng, accuracy_m, spread_m, place_id, distance_m, speed_kmh, source, accepted, reason)
  values (p_user, p_lat, p_lng, coalesce(p_accuracy, -1), p_spread, p_place, dist, speed, p_source, reason is null, reason);

  return jsonb_build_object('ok', reason is null, 'reason', reason, 'distance_m', round(dist::numeric, 1));
end $$;
revoke all on function public.check_location(uuid, double precision, double precision, real, real, uuid, real, text)
  from public, anon, authenticated;

create function public.require_active_user() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from public.profiles where id = uid and status = 'active') then
    raise exception 'account removed';
  end if;
  return uid;
end $$;
revoke all on function public.require_active_user() from public, anon;

-- ---------------------------------------------------------------------------
-- Actions called by the app. Rejections are returned (not raised) so the
-- location check and the audit entry are kept for bot detection.
-- ---------------------------------------------------------------------------
create function public.submit_crowd_report(
  p_place uuid, p_level int, p_lat double precision, p_lng double precision,
  p_accuracy real, p_spread real default 0
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_active_user();
  chk jsonb;
  new_id uuid;
begin
  if p_level not between 1 and 5 then raise exception 'level must be 1-5'; end if;
  if exists (select 1 from public.crowd_reports
             where user_id = uid and place_id = p_place and created_at > now() - interval '10 minutes') then
    return jsonb_build_object('ok', false, 'reason', 'too_soon');
  end if;

  chk := public.check_location(uid, p_lat, p_lng, p_accuracy, p_spread, p_place, null, 'crowd_report');
  if not (chk ->> 'ok')::boolean then
    perform public.log_event_as(uid, 'user', 'crowd.report_rejected', 'place', p_place::text,
      jsonb_build_object('reason', chk ->> 'reason', 'level', p_level));
    return chk;
  end if;

  insert into public.crowd_reports (place_id, user_id, level, lat, lng, accuracy_m, distance_m)
  values (p_place, uid, p_level, p_lat, p_lng, p_accuracy, (chk ->> 'distance_m')::real)
  returning id into new_id;
  perform public.log_event_as(uid, 'user', 'crowd.report', 'place', p_place::text,
    jsonb_build_object('report_id', new_id, 'level', p_level, 'distance_m', chk -> 'distance_m'));
  return jsonb_build_object('ok', true, 'id', new_id);
end $$;
revoke all on function public.submit_crowd_report(uuid, int, double precision, double precision, real, real) from public, anon;
grant execute on function public.submit_crowd_report(uuid, int, double precision, double precision, real, real) to authenticated;

create function public.submit_quick_report(
  p_kind text, p_place uuid, p_lat double precision, p_lng double precision,
  p_accuracy real, p_spread real default 0
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_active_user();
  k public.quick_report_kinds;
  chk jsonb;
  existing uuid;
  new_id uuid;
  city text;
begin
  select * into k from public.quick_report_kinds where kind = p_kind;
  if not found then raise exception 'unknown quick report kind'; end if;

  chk := public.check_location(uid, p_lat, p_lng, p_accuracy, p_spread, p_place, null, 'quick_report');
  if not (chk ->> 'ok')::boolean then
    perform public.log_event_as(uid, 'user', 'quick.report_rejected', 'place', p_place::text,
      jsonb_build_object('reason', chk ->> 'reason', 'kind', p_kind));
    return chk;
  end if;

  -- Same alert already active nearby: count it as a confirmation instead of a duplicate.
  select q.id into existing from public.quick_reports q
  where q.kind = p_kind and q.expires_at > now()
    and (q.place_id = p_place or (p_place is null and extensions.st_dwithin(
          extensions.st_setsrid(extensions.st_makepoint(q.lng, q.lat), 4326)::extensions.geography,
          extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography, 150)))
  limit 1;
  if existing is not null then
    insert into public.quick_report_votes (report_id, user_id, still_there) values (existing, uid, true)
      on conflict (report_id, user_id) do update set still_there = true, created_at = now();
    update public.quick_reports set
      still_there = (select count(*) from public.quick_report_votes where report_id = existing and still_there),
      expires_at = greatest(expires_at, now() + make_interval(mins => k.ttl_minutes))
    where id = existing;
    perform public.log_event_as(uid, 'user', 'quick.confirm', 'quick_report', existing::text, jsonb_build_object('kind', p_kind));
    return jsonb_build_object('ok', true, 'id', existing, 'merged', true);
  end if;

  select city_id into city from public.places where id = p_place;
  if city is null then
    select c.id into city from public.cities c order by
      extensions.st_distance(extensions.st_setsrid(extensions.st_makepoint(c.lng, c.lat), 4326)::extensions.geography,
                             extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography)
      limit 1;
  end if;

  insert into public.quick_reports (user_id, kind, place_id, city_id, lat, lng, expires_at)
  values (uid, p_kind, p_place, city, p_lat, p_lng, now() + make_interval(mins => k.ttl_minutes))
  returning id into new_id;
  perform public.log_event_as(uid, 'user', 'quick.report', 'quick_report', new_id::text,
    jsonb_build_object('kind', p_kind, 'place_id', p_place));
  return jsonb_build_object('ok', true, 'id', new_id);
end $$;
revoke all on function public.submit_quick_report(text, uuid, double precision, double precision, real, real) from public, anon;
grant execute on function public.submit_quick_report(text, uuid, double precision, double precision, real, real) to authenticated;

create function public.vote_quick_report(
  p_report uuid, p_still_there boolean, p_lat double precision, p_lng double precision,
  p_accuracy real, p_spread real default 0
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_active_user();
  q public.quick_reports;
  chk jsonb;
  d real;
begin
  select * into q from public.quick_reports where id = p_report and expires_at > now();
  if not found then return jsonb_build_object('ok', false, 'reason', 'expired'); end if;
  if q.user_id = uid then return jsonb_build_object('ok', false, 'reason', 'own_report'); end if;

  chk := public.check_location(uid, p_lat, p_lng, p_accuracy, p_spread, null, 500, 'quick_vote');
  d := extensions.st_distance(
    extensions.st_setsrid(extensions.st_makepoint(q.lng, q.lat), 4326)::extensions.geography,
    extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography);
  if (chk ->> 'ok')::boolean and d > 500 then chk := jsonb_build_object('ok', false, 'reason', 'not_at_place'); end if;
  if not (chk ->> 'ok')::boolean then return chk; end if;

  insert into public.quick_report_votes (report_id, user_id, still_there) values (p_report, uid, p_still_there)
    on conflict (report_id, user_id) do update set still_there = excluded.still_there, created_at = now();
  update public.quick_reports set
    still_there = (select count(*) from public.quick_report_votes where report_id = p_report and still_there),
    gone        = (select count(*) from public.quick_report_votes where report_id = p_report and not still_there)
  where id = p_report returning * into q;
  -- Two or more "gone" votes outnumbering "still there" ends the alert.
  if q.gone >= 2 and q.gone > q.still_there then
    update public.quick_reports set expires_at = now() where id = p_report;
  end if;
  perform public.log_event_as(uid, 'user', 'quick.vote', 'quick_report', p_report::text,
    jsonb_build_object('still_there', p_still_there));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.vote_quick_report(uuid, boolean, double precision, double precision, real, real) from public, anon;
grant execute on function public.vote_quick_report(uuid, boolean, double precision, double precision, real, real) to authenticated;

-- ---------------------------------------------------------------------------
-- Crowd levels: live from reports, otherwise an estimate from typical patterns
-- ---------------------------------------------------------------------------
create table public.crowd_patterns (
  category text primary key,
  weekday  real[] not null check (array_length(weekday, 1) = 24),
  weekend  real[] check (weekend is null or array_length(weekend, 1) = 24)
);
alter table public.crowd_patterns enable row level security;
revoke all on public.crowd_patterns from anon, authenticated;
grant select on public.crowd_patterns to anon, authenticated;
create policy crowd_patterns_read on public.crowd_patterns for select to anon, authenticated using (true);

-- Typical level by hour (0-23, India time). Hand-drafted starting points;
-- replaced by each place's own history as reports accumulate.
insert into public.crowd_patterns (category, weekday, weekend) values
  ('temple',        '{1,1,1,1,1,2,3,3,3,2,2,2,2,2,2,2,2,3,4,4,3,2,1,1}', '{1,1,1,1,1,2,3,4,4,3,3,3,3,3,3,3,3,4,5,5,4,3,2,1}'),
  ('religious',     '{1,1,1,1,1,2,2,2,2,2,2,2,3,3,2,2,2,2,3,3,2,2,1,1}', '{1,1,1,1,1,2,2,3,3,3,3,3,3,3,3,3,3,3,3,3,2,2,1,1}'),
  ('market',        '{1,1,1,1,1,1,1,1,2,2,3,3,3,3,3,3,4,4,5,5,4,3,2,1}', '{1,1,1,1,1,1,1,1,2,3,3,4,4,4,4,4,4,5,5,5,5,4,2,1}'),
  ('restaurant',    '{1,1,1,1,1,1,1,1,2,2,2,2,4,4,3,2,2,2,3,4,5,4,3,2}', '{1,1,1,1,1,1,1,1,2,3,3,3,4,5,4,3,3,3,4,5,5,5,4,2}'),
  ('cafe',          '{1,1,1,1,1,1,1,2,3,3,2,2,3,3,3,3,4,4,4,4,3,2,2,1}', '{1,1,1,1,1,1,1,1,2,3,3,3,4,4,4,4,4,5,5,4,4,3,2,1}'),
  ('street_food',   '{2,1,1,1,1,1,1,2,3,3,2,2,2,2,2,2,3,3,4,4,5,5,5,4}', '{3,2,1,1,1,1,1,2,3,3,3,3,3,3,3,3,3,4,4,5,5,5,5,4}'),
  ('mall',          '{1,1,1,1,1,1,1,1,1,1,1,2,3,3,3,3,3,4,4,5,5,4,2,1}', '{1,1,1,1,1,1,1,1,1,1,2,3,4,4,4,4,5,5,5,5,5,4,3,1}'),
  ('park',          '{1,1,1,1,1,2,4,4,3,2,1,1,1,1,1,2,3,4,4,3,2,1,1,1}', '{1,1,1,1,1,2,4,5,4,3,2,2,2,2,2,3,4,5,5,4,3,2,1,1}'),
  ('tourist',       '{1,1,1,1,1,1,1,1,2,2,3,3,3,3,3,3,3,3,2,2,1,1,1,1}', '{1,1,1,1,1,1,1,1,2,3,4,4,4,4,4,4,4,4,3,3,2,1,1,1}'),
  ('hospital',      '{2,2,1,1,1,1,2,2,3,4,4,4,4,3,3,3,3,3,3,3,2,2,2,2}', '{2,2,1,1,1,1,2,2,2,3,3,3,3,3,2,2,2,2,2,2,2,2,2,2}'),
  ('station',       '{2,2,2,2,2,3,3,4,4,4,3,3,3,3,3,3,4,4,4,4,3,3,3,2}', '{2,2,2,2,2,2,3,3,3,3,3,3,3,3,3,3,3,4,4,4,3,3,2,2}'),
  ('bank',          '{1,1,1,1,1,1,1,1,1,1,3,4,4,3,3,3,2,1,1,1,1,1,1,1}', '{1,1,1,1,1,1,1,1,1,1,2,2,2,2,1,1,1,1,1,1,1,1,1,1}'),
  ('government',    '{1,1,1,1,1,1,1,1,1,2,3,4,4,3,3,3,2,1,1,1,1,1,1,1}', '{1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1}'),
  ('education',     '{1,1,1,1,1,1,1,3,4,4,3,3,3,3,4,3,2,2,1,1,1,1,1,1}', '{1,1,1,1,1,1,1,1,1,2,2,2,2,2,2,2,1,1,1,1,1,1,1,1}'),
  ('entertainment', '{1,1,1,1,1,1,1,1,1,1,2,2,2,2,2,3,3,3,4,4,5,4,3,2}', '{2,1,1,1,1,1,1,1,1,1,2,3,3,4,4,4,4,4,5,5,5,5,4,2}'),
  ('other',         '{1,1,1,1,1,1,1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1,1,1}', null);

/** Typical level for a place at a time, with a small stable per-place variation. */
create function public.estimated_level(p_place uuid, p_category text, p_at timestamptz default now())
returns real
language sql stable set search_path = '' as $$
  select greatest(1, least(5,
    (case when extract(isodow from p_at at time zone 'Asia/Kolkata') in (6, 7)
          then coalesce(p.weekend, p.weekday) else p.weekday end)
      [extract(hour from p_at at time zone 'Asia/Kolkata')::int + 1]
    + ((abs(hashtext(p_place::text)) % 5) - 2) * 0.25))
  from public.crowd_patterns p
  where p.category = coalesce((select category from public.crowd_patterns where category = p_category), 'other');
$$;

/** Live level for one place, or null when there are too few recent reports. */
create function public.live_level(p_place uuid)
returns table (level real, weight real, reports int, last_report_at timestamptz)
language sql stable security definer set search_path = '' as $$
  with w as (
    select r.level, r.created_at,
           exp(-extract(epoch from now() - r.created_at) / 1800.0)
             * case when r.is_sample then 0.6 else 0.5 + coalesce(pr.trust_score, 0.5) end as weight
    from public.crowd_reports r
    left join public.profiles pr on pr.id = r.user_id
    where r.place_id = p_place
      and r.created_at > now() - interval '90 minutes'
      and (r.is_sample or pr.status = 'active')
  ), q as (
    select coalesce(sum(k.crowd_effect), 0) as nudge
    from public.quick_reports qr join public.quick_report_kinds k using (kind)
    where qr.place_id = p_place and qr.expires_at > now()
  )
  select greatest(1, least(5, sum(w.level * w.weight) / sum(w.weight) + (select nudge from q) * 0.5))::real,
         sum(w.weight)::real, count(*)::int, max(w.created_at)
  from w having sum(w.weight) >= 0.3;
$$;

/** One place's current crowd: live if enough reports, otherwise estimated. */
create view public.place_crowd_now with (security_invoker = false) as
  select p.id as place_id, p.city_id,
         round(coalesce(l.level, public.estimated_level(p.id, p.category)))::int as level,
         case when l.level is not null then 'live' else 'estimated' end as source,
         l.reports, l.last_report_at
  from public.places p
  left join lateral public.live_level(p.id) l on true
  where p.status <> 'removed';
revoke all on public.place_crowd_now from anon, authenticated;
grant select on public.place_crowd_now to authenticated;

/**
 * Everything the map needs for one city, as one JSON value (so it is not cut
 * off by the API's row limit): places with their level, plus active alerts.
 */
create function public.crowd_map(p_city text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'places', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'name_hi', p.name_hi, 'category', p.category,
        'lat', p.lat, 'lng', p.lng,
        'level', round(coalesce(l.level, public.estimated_level(p.id, p.category)))::int,
        'source', case when l.level is not null then 'live' else 'estimated' end,
        'reports', coalesce(l.reports, 0)))
      from public.places p left join lateral public.live_level(p.id) l on true
      where p.city_id = p_city and p.status <> 'removed'), '[]'::jsonb),
    'alerts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', q.id, 'kind', q.kind, 'place_id', q.place_id, 'lat', q.lat, 'lng', q.lng,
        'still_there', q.still_there, 'gone', q.gone, 'created_at', q.created_at, 'expires_at', q.expires_at))
      from public.quick_reports q where q.city_id = p_city and q.expires_at > now()), '[]'::jsonb),
    'generated_at', now());
$$;
revoke all on function public.crowd_map(text) from public;
grant execute on function public.crowd_map(text) to anon, authenticated;

/** Details for one place's panel, including the caller's own recent report. */
create function public.place_details(p_place uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'place', jsonb_build_object('id', p.id, 'name', p.name, 'name_hi', p.name_hi, 'category', p.category,
                                'address', p.address, 'lat', p.lat, 'lng', p.lng, 'radius_m', p.radius_m,
                                'city_id', p.city_id, 'osm_type', p.osm_type, 'osm_id', p.osm_id),
    'crowd', jsonb_build_object(
      'level', round(coalesce(l.level, public.estimated_level(p.id, p.category)))::int,
      'source', case when l.level is not null then 'live' else 'estimated' end,
      'reports', coalesce(l.reports, 0), 'last_report_at', l.last_report_at,
      'today', (select jsonb_agg(round(public.estimated_level(p.id, p.category,
                  date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata'
                  + make_interval(hours => h)))::int order by h)
                from generate_series(0, 23) h)),
    'alerts', coalesce((select jsonb_agg(jsonb_build_object(
        'id', q.id, 'kind', q.kind, 'still_there', q.still_there, 'gone', q.gone,
        'created_at', q.created_at, 'expires_at', q.expires_at, 'mine', q.user_id = auth.uid())
        order by q.created_at desc)
      from public.quick_reports q where q.place_id = p.id and q.expires_at > now()), '[]'::jsonb),
    'my_report', (select jsonb_build_object('id', r.id, 'level', r.level, 'created_at', r.created_at,
                    'editable', r.created_at > now() - interval '15 minutes')
                  from public.crowd_reports r
                  where r.place_id = p.id and r.user_id = auth.uid()
                  order by r.created_at desc limit 1),
    'signed_in', auth.uid() is not null)
  from public.places p
  left join lateral public.live_level(p.id) l on true
  where p.id = p_place and p.status <> 'removed';
$$;
revoke all on function public.place_details(uuid) from public;
grant execute on function public.place_details(uuid) to anon, authenticated;
