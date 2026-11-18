-- User 2: automatic bot detection.
--
-- Every 10 minutes bot_sweep() scores each active, non-admin account on recent
-- evidence. At 100 points the account is removed automatically (no admin
-- approval): its reports, alerts, uploads and comments disappear at once but are
-- kept. Each removal is logged as system.bot_removed with the evidence, and an
-- admin can restore the account from /admin/bots. Accounts between 40 and 99
-- points are flagged for admins and their trust is lowered (so their reports
-- count for less) without removing anything.
--
-- Evidence only counts from after an admin's last restore of that account, so a
-- false alarm that an admin corrected is not repeated on the same evidence.

-- ---------------------------------------------------------------------------
-- Rules (one place to tune them)
-- ---------------------------------------------------------------------------
create table public.bot_rules (
  signal     text primary key,
  window_min int  not null,   -- how far back to look
  threshold  int  not null,   -- count at which the signal fires
  points     int  not null,   -- added to the score when it fires
  label      text not null
);
alter table public.bot_rules enable row level security;
revoke all on public.bot_rules from anon, authenticated;
grant select on public.bot_rules to authenticated;
create policy bot_rules_read on public.bot_rules for select to authenticated using (public.is_admin());

insert into public.bot_rules (signal, window_min, threshold, points, label) values
  ('impossible_travel', 1440, 3, 100, 'Impossible travel between GPS checks'),
  ('not_at_place',      1440, 15, 50, 'Many reports for places the user is not at'),
  ('rate_limited',      1440, 5,  40, 'Kept hitting rate limits'),
  ('burst_places',      30,   8,  60, 'Posted at many different places within 30 minutes'),
  ('too_many_actions',  60,   80, 60, 'Too many actions in one hour'),
  ('junk_text',         1440, 5,  40, 'Repeated spam, nonsense or duplicate text'),
  ('duplicate_media',   1440, 3,  60, 'Uploaded the same file again and again'),
  ('new_account_heavy', 1440, 40, 40, 'Brand-new account with heavy activity'),
  ('fake_places',       10080, 2, 60, 'Added places that others said don''t exist');

-- ---------------------------------------------------------------------------
-- Findings: one row per account per sweep where anything fired.
-- ---------------------------------------------------------------------------
create table public.bot_flags (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  score      int  not null,
  signals    jsonb not null,        -- {"impossible_travel": 4, ...} counts of signals that fired
  outcome    text not null check (outcome in ('removed', 'flagged')),
  created_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz
);
create index bot_flags_recent_idx on public.bot_flags (created_at desc);
create index bot_flags_user_idx on public.bot_flags (user_id, created_at desc);
alter table public.bot_flags enable row level security;
revoke all on public.bot_flags from anon, authenticated;
grant select on public.bot_flags to authenticated;
create policy bot_flags_admin_read on public.bot_flags for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Contracts for User 1 (docs/CONTRACTS.md): trust and removal status.
-- ---------------------------------------------------------------------------
create view public.user_trust with (security_invoker = false) as
  select id as user_id, trust_score, status = 'removed' as removed from public.profiles;
revoke all on public.user_trust from anon, authenticated;
grant select on public.user_trust to authenticated;

create function public.is_removed(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select status = 'removed' from public.profiles where id = p_user), false);
$$;
grant execute on function public.is_removed(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Scoring one account
-- ---------------------------------------------------------------------------
/** Counts for every signal for one user, using evidence newer than p_since. */
create function public.bot_signals(p_user uuid, p_since timestamptz default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  since timestamptz := coalesce(p_since, '-infinity');
  restored timestamptz;
  w record;
  n int;
  out jsonb := '{}';
begin
  select max(at) into restored from public.audit_log
   where action = 'admin.user_restore' and target_id = p_user::text;
  since := greatest(since, coalesce(restored, '-infinity'));

  for w in select * from public.bot_rules loop
    declare from_at timestamptz := greatest(since, now() - make_interval(mins => w.window_min));
    begin
      n := case w.signal
        when 'impossible_travel' then
          (select count(*) from public.location_checks
            where user_id = p_user and at > from_at and reason = 'impossible_travel')
          + (select count(*) from public.audit_log
            where actor_id = p_user and at > from_at and details ->> 'reason' = 'impossible_travel'
              and action = 'media.upload_rejected')
        when 'not_at_place' then
          (select count(*) from public.location_checks
            where user_id = p_user and at > from_at and reason = 'not_at_place')
          + (select count(*) from public.audit_log
            where actor_id = p_user and at > from_at and details ->> 'reason' = 'not_at_place'
              and action = 'media.upload_rejected')
        when 'rate_limited' then
          (select count(*) from public.location_checks
            where user_id = p_user and at > from_at and reason = 'rate_limited')
          + (select count(*) from public.audit_log
            where actor_id = p_user and at > from_at and details ->> 'reason' = 'rate_limited'
              and action in ('media.upload_rejected', 'comment.rejected'))
        when 'burst_places' then
          (select count(distinct place_id) from (
             select place_id from public.crowd_reports where user_id = p_user and created_at > from_at
             union all select place_id from public.quick_reports where user_id = p_user and created_at > from_at
             union all select place_id from public.media where user_id = p_user and created_at > from_at
           ) x where place_id is not null)
        when 'too_many_actions' then
          (select count(*) from public.audit_log
            where actor_id = p_user and at > from_at and action not like 'auth.%')
        when 'junk_text' then
          (select count(*) from public.audit_log
            where actor_id = p_user and at > from_at
              and ((action = 'comment.rejected' and details ->> 'reason' in ('duplicate', 'bad_text'))
                or (action = 'media.upload_rejected' and details ->> 'reason' = 'bad_caption')))
        when 'duplicate_media' then
          -- Same file content (Storage's checksum) uploaded more than once by this user.
          (select coalesce(sum(c - 1), 0) from (
             select count(*) c from public.media m
             join storage.objects o on o.bucket_id = 'media' and o.name = m.storage_path
             where m.user_id = p_user and m.created_at > from_at and o.metadata ->> 'eTag' is not null
             group by o.metadata ->> 'eTag' having count(*) > 1) d)
        when 'new_account_heavy' then
          (select case when pr.created_at > now() - interval '24 hours' then
             (select count(*) from public.audit_log
               where actor_id = p_user and at > from_at and action not like 'auth.%') else 0 end
           from public.profiles pr where pr.id = p_user)
        when 'fake_places' then
          (select count(*) from public.places
            where added_by = p_user and status = 'removed' and updated_at > from_at)
        else 0 end;
      out := out || jsonb_build_object(w.signal, coalesce(n, 0));
    end;
  end loop;
  return out;
end $$;
revoke all on function public.bot_signals(uuid, timestamptz) from public, anon, authenticated;

/** Score = sum of points of the rules whose count reached their threshold. */
create function public.bot_score(p_signals jsonb) returns table (score int, fired jsonb)
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(r.points), 0)::int,
         coalesce(jsonb_object_agg(r.signal, (p_signals ->> r.signal)::int) filter (where r.signal is not null), '{}')
  from public.bot_rules r
  where coalesce((p_signals ->> r.signal)::int, 0) >= r.threshold;
$$;
revoke all on function public.bot_score(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The sweep
-- ---------------------------------------------------------------------------
create function public.bot_sweep() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u record;
  sig jsonb;
  s record;
  removed int := 0;
  flagged int := 0;
  checked int := 0;
  labels text;
begin
  -- Only accounts that did something recently need checking.
  for u in
    select p.id, p.trust_score from public.profiles p
    where p.status = 'active' and p.role <> 'admin' and not p.is_sample
      and exists (select 1 from public.audit_log a where a.actor_id = p.id and a.at > now() - interval '24 hours')
  loop
    checked := checked + 1;
    sig := public.bot_signals(u.id, now() - interval '7 days');
    select * into s from public.bot_score(sig);
    continue when s.score < 40;
    -- Don't repeat the same flag every 10 minutes: only when the evidence changed.
    continue when exists (select 1 from public.bot_flags f where f.user_id = u.id
                          and f.signals = s.fired and f.created_at > now() - interval '24 hours');

    select string_agg(r.label || ' (' || (s.fired ->> r.signal) || ')', '; ' order by r.points desc)
      into labels from public.bot_rules r where s.fired ? r.signal;

    if s.score >= 100 then
      update public.profiles
         set status = 'removed', removed_at = now(),
             removed_reason = left('Automatic: ' || labels, 300)
       where id = u.id;
      insert into public.bot_flags (user_id, score, signals, outcome) values (u.id, s.score, s.fired, 'removed');
      perform public.log_event_as(null, 'system', 'system.bot_removed', 'profile', u.id::text,
        jsonb_build_object('score', s.score, 'signals', s.fired, 'reason', labels));
      removed := removed + 1;
    else
      update public.profiles set trust_score = least(trust_score, 0.2) where id = u.id;
      insert into public.bot_flags (user_id, score, signals, outcome) values (u.id, s.score, s.fired, 'flagged');
      perform public.log_event_as(null, 'system', 'system.bot_flagged', 'profile', u.id::text,
        jsonb_build_object('score', s.score, 'signals', s.fired, 'reason', labels));
      flagged := flagged + 1;
    end if;
  end loop;
  return jsonb_build_object('checked', checked, 'removed', removed, 'flagged', flagged);
end $$;
revoke all on function public.bot_sweep() from public, anon, authenticated;
grant execute on function public.bot_sweep() to service_role;

/** Lets an admin run the sweep now from the dashboard (logged). */
create function public.admin_run_bot_sweep() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  admin uuid := public.require_admin();
  res jsonb := public.bot_sweep();
begin
  perform public.log_event_as(admin, 'admin', 'admin.bot_sweep', null, null, res);
  return res;
end $$;
revoke all on function public.admin_run_bot_sweep() from public, anon;
grant execute on function public.admin_run_bot_sweep() to authenticated;

/**
 * Admin marks a flag as looked at (logged). With p_false_alarm, the lowered
 * trust goes back to the default so the person's reports count fully again.
 */
create function public.admin_review_flag(p_flag bigint, p_false_alarm boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  admin uuid := public.require_admin();
  f public.bot_flags;
begin
  update public.bot_flags set reviewed_by = admin, reviewed_at = now()
   where id = p_flag and reviewed_at is null returning * into f;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_change'); end if;
  if p_false_alarm then
    update public.profiles set trust_score = greatest(trust_score, 0.5) where id = f.user_id;
  end if;
  perform public.log_event_as(admin, 'admin', 'admin.bot_flag_reviewed', 'profile', f.user_id::text,
    jsonb_build_object('flag_id', p_flag, 'false_alarm', p_false_alarm, 'score', f.score));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.admin_review_flag(bigint, boolean) from public, anon;
grant execute on function public.admin_review_flag(bigint, boolean) to authenticated;

/** Flags with the account's name and current state, newest first. */
create function public.admin_bot_flags(p_outcome text default null, p_open_only boolean default false, p_limit int default 50)
returns table (id bigint, user_id uuid, display_name text, user_status text, removed_reason text, score int,
               signals jsonb, outcome text, created_at timestamptz, reviewed_at timestamptz, reviewer text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_admin();
  return query
  select f.id, f.user_id, p.display_name, p.status, p.removed_reason, f.score, f.signals, f.outcome, f.created_at,
         f.reviewed_at, r.display_name
  from public.bot_flags f
  join public.profiles p on p.id = f.user_id
  left join public.profiles r on r.id = f.reviewed_by
  where (p_outcome is null or f.outcome = p_outcome) and (not p_open_only or f.reviewed_at is null)
  order by f.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end $$;
revoke all on function public.admin_bot_flags(text, boolean, int) from public, anon;
grant execute on function public.admin_bot_flags(text, boolean, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Schedule: every 10 minutes, inside the database (pg_cron).
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron;
select cron.schedule('crowdmap-bot-sweep', '*/10 * * * *', 'select public.bot_sweep()');
