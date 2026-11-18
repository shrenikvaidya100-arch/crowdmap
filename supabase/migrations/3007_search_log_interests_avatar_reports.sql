-- Design steps 10, 12, 13: search log and admin charts, avatar seed, photo reports.

-- ---------------------------------------------------------------------------
-- Search log (step 10). Only what was searched, never who: no user id, no IP.
-- A "search" is a pick or an Enter in a search box, not every keystroke.
-- ---------------------------------------------------------------------------
create table public.search_log (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  query      text not null check (char_length(query) between 2 and 60),
  city_id    text references public.cities(id) on delete set null,
  results    int not null default 0 check (results between 0 and 100),
  signed_in  boolean not null default false
);
create index search_log_at_idx on public.search_log (at desc);
alter table public.search_log enable row level security;
revoke all on public.search_log from anon, authenticated;
grant select on public.search_log to authenticated;
create policy search_log_admin_read on public.search_log for select to authenticated using (public.is_admin());

/** Called by the server's /api/search/log route (service role only). */
create function public.log_search(p_query text, p_city text, p_results int, p_signed_in boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare q text := lower(left(regexp_replace(trim(coalesce(p_query, '')), '\s+', ' ', 'g'), 60));
begin
  if char_length(q) < 2 then return; end if;
  -- The same words within 10 seconds count once (double taps, repeated Enter).
  if exists (select 1 from public.search_log where query = q and at > now() - interval '10 seconds') then return; end if;
  insert into public.search_log (query, city_id, results, signed_in)
  values (q, (select id from public.cities where id = p_city), least(greatest(coalesce(p_results, 0), 0), 100), coalesce(p_signed_in, false));
end $$;
revoke all on function public.log_search(text, text, int, boolean) from public, anon, authenticated;
grant execute on function public.log_search(text, text, int, boolean) to service_role;

/** Searches per day (India time) for the last p_days days, oldest first. */
create function public.admin_search_daily(p_days int default 90)
returns table (day date, n int)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_admin();
  return query
  with days as (
    select generate_series((now() at time zone 'Asia/Kolkata')::date - (least(greatest(p_days, 1), 366) - 1),
                           (now() at time zone 'Asia/Kolkata')::date, interval '1 day')::date as day
  )
  select d.day, coalesce(count(s.id), 0)::int
  from days d left join public.search_log s on (s.at at time zone 'Asia/Kolkata')::date = d.day
  group by d.day order by d.day;
end $$;
revoke all on function public.admin_search_daily(int) from public, anon;
grant execute on function public.admin_search_daily(int) to authenticated;

/** Latest searches (no identities), with the total for paging. */
create function public.admin_recent_searches(p_limit int default 50, p_offset int default 0)
returns table (at timestamptz, query text, city_id text, results int, signed_in boolean, total bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_admin();
  return query
  select s.at, s.query, s.city_id, s.results, s.signed_in, count(*) over ()
  from public.search_log s order by s.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 50) offset greatest(coalesce(p_offset, 0), 0);
end $$;
revoke all on function public.admin_recent_searches(int, int) from public, anon;
grant execute on function public.admin_recent_searches(int, int) to authenticated;

/**
 * Interests = saved places plus reminders ("tell me when it's quiet").
 * Daily new interests, totals, unique users and the top five places.
 */
create function public.admin_interest_stats(p_days int default 90) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  n int := least(greatest(p_days, 1), 366);
  res jsonb;
begin
  perform public.require_admin();
  with interests as (
    select user_id, place_id, created_at from public.saved_places
    union all
    select user_id, place_id, created_at from public.place_watches
  ), days as (
    select generate_series((now() at time zone 'Asia/Kolkata')::date - (n - 1),
                           (now() at time zone 'Asia/Kolkata')::date, interval '1 day')::date as day
  )
  select jsonb_build_object(
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'n', c.n) order by d.day), '[]')
              from days d cross join lateral (
                select count(*)::int n from interests i where (i.created_at at time zone 'Asia/Kolkata')::date = d.day) c),
    'total', (select count(*) from interests),
    'saved', (select count(*) from public.saved_places),
    'reminders', (select count(*) from public.place_watches),
    'users', (select count(distinct user_id) from interests),
    'top', (select coalesce(jsonb_agg(t), '[]') from (
              select p.id, p.name, p.city_id, count(*)::int n
              from interests i join public.places p on p.id = i.place_id
              group by p.id, p.name, p.city_id order by count(*) desc, p.name limit 5) t)
  ) into res;
  return res;
end $$;
revoke all on function public.admin_interest_stats(int) from public, anon;
grant execute on function public.admin_interest_stats(int) to authenticated;

-- ---------------------------------------------------------------------------
-- Avatar (step 13): the seed is all that's stored; the face is drawn from it.
-- Display names: no links (3001), and now no email addresses or phone numbers.
-- ---------------------------------------------------------------------------
alter table public.profiles add column avatar_seed text check (avatar_seed is null or char_length(avatar_seed) between 3 and 80);
grant update (avatar_seed) on public.profiles to authenticated;
alter table public.profiles add constraint profiles_display_name_private
  check (display_name !~ '[^\s@]+@[^\s@]+\.[a-z]' and display_name !~ '[0-9][0-9 ()+-]{7,}[0-9]') not valid;

-- ---------------------------------------------------------------------------
-- Photo and video reports (step 12): "Report photo" puts it in the admin queue.
-- ---------------------------------------------------------------------------
create table public.media_reports (
  id          bigint generated always as identity primary key,
  media_id    uuid not null references public.media(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  reason      text not null check (reason in ('inappropriate', 'not_this_place', 'private_info', 'spam', 'other')),
  note        text check (note is null or char_length(note) <= 200),
  status      text not null default 'open' check (status in ('open', 'dismissed', 'hidden')),
  created_at  timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  unique (media_id, user_id)
);
create index media_reports_open_idx on public.media_reports (created_at) where status = 'open';
create index media_reports_user_idx on public.media_reports (user_id);
create index media_reports_reviewer_idx on public.media_reports (reviewed_by) where reviewed_by is not null;
alter table public.media_reports enable row level security;
revoke all on public.media_reports from anon, authenticated;
grant select on public.media_reports to authenticated;
create policy media_reports_read on public.media_reports for select to authenticated using (user_id = auth.uid() or public.is_admin());

create function public.report_media(p_media uuid, p_reason text, p_note text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_active_user();
begin
  if not exists (select 1 from public.media where id = p_media and status = 'visible') then raise exception 'media not found'; end if;
  if exists (select 1 from public.media where id = p_media and user_id = uid) then
    return jsonb_build_object('ok', false, 'reason', 'own_media');
  end if;
  if (select count(*) from public.media_reports where user_id = uid and created_at > now() - interval '1 day') >= 20 then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;
  insert into public.media_reports (media_id, user_id, reason, note)
  values (p_media, uid, p_reason, nullif(trim(coalesce(p_note, '')), ''))
  on conflict (media_id, user_id) do nothing;
  if not found then return jsonb_build_object('ok', false, 'reason', 'already_reported'); end if;
  perform public.log_event_as(uid, 'user', 'media.report', 'media', p_media::text, jsonb_build_object('reason', p_reason));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.report_media(uuid, text, text) from public, anon;
grant execute on function public.report_media(uuid, text, text) to authenticated;

/** Open reports grouped by upload, most reported first. */
create function public.admin_report_queue()
returns table (media_id uuid, kind text, caption text, storage_path text, author text, place_name text,
               reports int, reasons text[], notes text[], first_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_admin();
  return query
  select m.id, m.kind, m.caption, m.storage_path, pr.display_name, p.name, count(r.id)::int,
         array_agg(distinct r.reason), array_remove(array_agg(r.note), null), min(r.created_at)
  from public.media_reports r
  join public.media m on m.id = r.media_id
  join public.profiles pr on pr.id = m.user_id
  join public.places p on p.id = m.place_id
  where r.status = 'open'
  group by m.id, m.kind, m.caption, m.storage_path, pr.display_name, p.name
  order by count(r.id) desc, min(r.created_at)
  limit 100;
end $$;
revoke all on function public.admin_report_queue() from public, anon;
grant execute on function public.admin_report_queue() to authenticated;

/** Keep (dismiss the reports) or hide the upload; both close its open reports. */
create function public.admin_resolve_reports(p_media uuid, p_action text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare admin uuid := public.require_admin(); n int;
begin
  if p_action not in ('keep', 'hide') then raise exception 'bad action'; end if;
  if p_action = 'hide' then
    update public.media set status = 'removed', removed_by = 'admin', removed_reason = 'Reported by users'
     where id = p_media and status = 'visible';
  end if;
  update public.media_reports set status = case when p_action = 'hide' then 'hidden' else 'dismissed' end,
         reviewed_by = admin, reviewed_at = now()
   where media_id = p_media and status = 'open';
  get diagnostics n = row_count;
  perform public.log_event_as(admin, 'admin', case when p_action = 'hide' then 'admin.media_remove' else 'admin.reports_dismissed' end,
    'media', p_media::text, jsonb_build_object('reason', 'Reported by users', 'reports', n));
  return jsonb_build_object('ok', true, 'reports', n);
end $$;
revoke all on function public.admin_resolve_reports(uuid, text) from public, anon;
grant execute on function public.admin_resolve_reports(uuid, text) to authenticated;
