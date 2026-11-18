-- Saved places and "tell me when it's quiet" alerts.
--
-- * saved_places: a person's starred places.
-- * place_watches: "notify me when this place is quiet (level <= target) within
--   the next N hours". One-shot: it fires once, or expires.
-- * notifications: the in-app inbox (the bell). Always works.
-- * push_subscriptions: browser push endpoints (Web Push) per device.
--
-- Every 2 minutes check_watches() (pg_cron) fires or expires watches. If any
-- notification needs a push, it wakes the site's /api/push/send route through
-- pg_net with a token the database generated itself; the route signs and sends
-- the pushes (Web Push needs crypto the database doesn't have).

create extension if not exists pg_net;

-- ---------------------------------------------------------------------------
-- Private settings (no grants: only security-definer functions read it)
-- ---------------------------------------------------------------------------
create table public.app_settings (key text primary key, value text not null);
alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon, authenticated;
insert into public.app_settings (key, value) values
  ('site_url', 'https://crowdmap-kappa.vercel.app'),
  ('push_token', encode(extensions.gen_random_bytes(32), 'hex'));

/** The server checks the token pg_net sends; only the service role may ask. */
create function public.verify_push_token(p_token text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(p_token = (select value from public.app_settings where key = 'push_token'), false);
$$;
revoke all on function public.verify_push_token(text) from public, anon, authenticated;
grant execute on function public.verify_push_token(text) to service_role;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.saved_places (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  place_id   uuid not null references public.places(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, place_id)
);
create index saved_places_place_idx on public.saved_places (place_id);

create table public.place_watches (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  place_id     uuid not null references public.places(id) on delete cascade,
  target_level int  not null default 2 check (target_level between 1 and 3),
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  status       text not null default 'active' check (status in ('active', 'fired', 'expired', 'cancelled')),
  fired_at     timestamptz,
  fired_level  int,
  fired_source text check (fired_source in ('live', 'estimated'))
);
create index place_watches_active_idx on public.place_watches (expires_at) where status = 'active';
create index place_watches_user_idx on public.place_watches (user_id, created_at desc);
create index place_watches_place_idx on public.place_watches (place_id);
create unique index place_watches_one_active on public.place_watches (user_id, place_id) where status = 'active';

create table public.notifications (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  kind        text not null check (kind in ('place_quiet', 'watch_expired')),
  place_id    uuid references public.places(id) on delete cascade,
  data        jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  read_at     timestamptz,
  push_status text not null default 'none' check (push_status in ('pending', 'sent', 'failed', 'none')),
  pushed_at   timestamptz
);
create index notifications_user_idx on public.notifications (user_id, id desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;
create index notifications_push_idx on public.notifications (id) where push_status = 'pending';

create table public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  endpoint     text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh       text not null check (char_length(p256dh) between 20 and 200),
  auth         text not null check (char_length(auth) between 10 and 100),
  user_agent   text check (char_length(user_agent) <= 300),
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- Owners read their own rows; all writes go through the functions below.
alter table public.saved_places enable row level security;
alter table public.place_watches enable row level security;
alter table public.notifications enable row level security;
alter table public.push_subscriptions enable row level security;
revoke all on public.saved_places, public.place_watches, public.notifications, public.push_subscriptions from anon, authenticated;
grant select on public.saved_places, public.place_watches, public.notifications, public.push_subscriptions to authenticated;
create policy saved_places_own on public.saved_places for select to authenticated using (user_id = auth.uid());
create policy place_watches_own on public.place_watches for select to authenticated using (user_id = auth.uid());
create policy notifications_own on public.notifications for select to authenticated using (user_id = auth.uid());
create policy push_subscriptions_own on public.push_subscriptions for select to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Current level of a place, the same way the map shows it
-- ---------------------------------------------------------------------------
create function public.current_level(p_place uuid)
returns table (level int, source text)
language sql stable security definer set search_path = '' as $$
  select round(coalesce(l.level, public.estimated_level(p.id, p.category)))::int,
         case when l.level is not null then 'live' else 'estimated' end
  from public.places p
  left join lateral public.live_level(p.id) l on true
  where p.id = p_place and p.status <> 'removed';
$$;
grant execute on function public.current_level(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Saved places
-- ---------------------------------------------------------------------------
create function public.toggle_saved_place(p_place uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_active_user();
begin
  if not exists (select 1 from public.places where id = p_place and status <> 'removed') then
    raise exception 'place not found';
  end if;
  delete from public.saved_places where user_id = uid and place_id = p_place;
  if found then
    perform public.log_event_as(uid, 'user', 'place.unsave', 'place', p_place::text, '{}');
    return jsonb_build_object('ok', true, 'saved', false);
  end if;
  if (select count(*) from public.saved_places where user_id = uid) >= 100 then
    return jsonb_build_object('ok', false, 'reason', 'too_many_saved');
  end if;
  insert into public.saved_places (user_id, place_id) values (uid, p_place);
  perform public.log_event_as(uid, 'user', 'place.save', 'place', p_place::text, '{}');
  return jsonb_build_object('ok', true, 'saved', true);
end $$;
revoke all on function public.toggle_saved_place(uuid) from public, anon;
grant execute on function public.toggle_saved_place(uuid) to authenticated;

/** Saved places with their current level and any active watch, newest first. */
create function public.my_saved_places()
returns table (place_id uuid, name text, name_hi text, category text, city_id text, lat double precision,
               lng double precision, saved_at timestamptz, level int, source text, watch_until timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.id, p.name, p.name_hi, p.category, p.city_id, p.lat, p.lng, s.created_at, c.level, c.source,
         (select w.expires_at from public.place_watches w
           where w.user_id = s.user_id and w.place_id = p.id and w.status = 'active')
  from public.saved_places s
  join public.places p on p.id = s.place_id and p.status <> 'removed'
  left join lateral public.current_level(p.id) c on true
  where s.user_id = auth.uid()
  order by s.created_at desc;
$$;
revoke all on function public.my_saved_places() from public, anon;
grant execute on function public.my_saved_places() to authenticated;

/** For the place panel: is it saved, and is there an active watch? */
create function public.my_place_state(p_place uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'signed_in', auth.uid() is not null,
    'saved', exists (select 1 from public.saved_places where user_id = auth.uid() and place_id = p_place),
    'watch', (select jsonb_build_object('id', w.id, 'expires_at', w.expires_at, 'target_level', w.target_level)
              from public.place_watches w
              where w.user_id = auth.uid() and w.place_id = p_place and w.status = 'active'),
    'push_devices', (select count(*) from public.push_subscriptions where user_id = auth.uid()));
$$;
grant execute on function public.my_place_state(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Watches
-- ---------------------------------------------------------------------------
create function public.watch_place(p_place uuid, p_hours int default 6, p_target int default 2) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_active_user();
  cur record;
  new_id uuid;
  until timestamptz;
begin
  if p_hours not between 1 and 24 then raise exception 'hours must be 1-24'; end if;
  if p_target not between 1 and 3 then raise exception 'target must be 1-3'; end if;
  select * into cur from public.current_level(p_place);
  if not found then raise exception 'place not found'; end if;
  if cur.level <= p_target then
    return jsonb_build_object('ok', false, 'reason', 'already_quiet', 'level', cur.level, 'source', cur.source);
  end if;
  if (select count(*) from public.place_watches where user_id = uid and status = 'active') >= 10 then
    return jsonb_build_object('ok', false, 'reason', 'too_many_watches');
  end if;
  if (select count(*) from public.audit_log
      where actor_id = uid and action = 'watch.create' and at > now() - interval '1 day') >= 50 then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;
  until := now() + make_interval(hours => p_hours);
  -- One active watch per place: a new one replaces the old.
  update public.place_watches set status = 'cancelled'
   where user_id = uid and place_id = p_place and status = 'active';
  insert into public.place_watches (user_id, place_id, target_level, expires_at)
  values (uid, p_place, p_target, until) returning id into new_id;
  perform public.log_event_as(uid, 'user', 'watch.create', 'place', p_place::text,
    jsonb_build_object('watch_id', new_id, 'hours', p_hours, 'target_level', p_target, 'level_now', cur.level));
  return jsonb_build_object('ok', true, 'id', new_id, 'expires_at', until);
end $$;
revoke all on function public.watch_place(uuid, int, int) from public, anon;
grant execute on function public.watch_place(uuid, int, int) to authenticated;

create function public.cancel_watch(p_watch uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_active_user(); w public.place_watches;
begin
  update public.place_watches set status = 'cancelled'
   where id = p_watch and user_id = uid and status = 'active' returning * into w;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  perform public.log_event_as(uid, 'user', 'watch.cancel', 'place', w.place_id::text, jsonb_build_object('watch_id', w.id));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.cancel_watch(uuid) from public, anon;
grant execute on function public.cancel_watch(uuid) to authenticated;

/** Marks some (or all, when p_ids is null) of the caller's notifications read. */
create function public.mark_notifications_read(p_ids bigint[] default null) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.notifications set read_at = now()
   where user_id = auth.uid() and read_at is null and (p_ids is null or id = any(p_ids));
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.mark_notifications_read(bigint[]) from public, anon;
grant execute on function public.mark_notifications_read(bigint[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Push subscriptions
-- ---------------------------------------------------------------------------
create function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_active_user();
begin
  if (select count(*) from public.push_subscriptions where user_id = uid and endpoint <> p_endpoint) >= 10 then
    return jsonb_build_object('ok', false, 'reason', 'too_many_devices');
  end if;
  -- An endpoint belongs to one browser; if someone else used it before, it's now this user's.
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (uid, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh,
    auth = excluded.auth, user_agent = excluded.user_agent, created_at = now();
  perform public.log_event_as(uid, 'user', 'push.subscribe', null, null, '{}');
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.save_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;

create function public.delete_push_subscription(p_endpoint text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_active_user();
begin
  delete from public.push_subscriptions where user_id = uid and endpoint = p_endpoint;
  if found then perform public.log_event_as(uid, 'user', 'push.unsubscribe', null, null, '{}'); end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.delete_push_subscription(text) from public, anon;
grant execute on function public.delete_push_subscription(text) to authenticated;

-- ---------------------------------------------------------------------------
-- The checker (pg_cron, every 2 minutes) and push dispatch
-- ---------------------------------------------------------------------------
/** Wakes the site to send pending pushes. Called by check_watches(). */
create function public.dispatch_pushes() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.notifications where push_status = 'pending') then return; end if;
  perform net.http_post(
    url := (select value from public.app_settings where key = 'site_url') || '/api/push/send',
    headers := jsonb_build_object('Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || (select value from public.app_settings where key = 'push_token')),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000);
end $$;
revoke all on function public.dispatch_pushes() from public, anon, authenticated;

create function public.check_watches() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  w record;
  cur record;
  fired int := 0;
  expired int := 0;
  has_push boolean;
  info jsonb;
begin
  for w in
    select pw.*, p.name, p.name_hi, p.city_id, pr.status as user_status
    from public.place_watches pw
    join public.places p on p.id = pw.place_id
    join public.profiles pr on pr.id = pw.user_id
    where pw.status = 'active'
    for update of pw skip locked
  loop
    if w.user_status <> 'active' then
      update public.place_watches set status = 'cancelled' where id = w.id;
      continue;
    end if;
    has_push := exists (select 1 from public.push_subscriptions where user_id = w.user_id);
    info := jsonb_build_object('place_name', w.name, 'place_name_hi', w.name_hi, 'city_id', w.city_id,
                               'watch_id', w.id, 'target_level', w.target_level);
    select * into cur from public.current_level(w.place_id);
    if found and cur.level <= w.target_level then
      update public.place_watches set status = 'fired', fired_at = now(), fired_level = cur.level, fired_source = cur.source
       where id = w.id;
      insert into public.notifications (user_id, kind, place_id, data, push_status)
      values (w.user_id, 'place_quiet', w.place_id, info || jsonb_build_object('level', cur.level, 'source', cur.source),
              case when has_push then 'pending' else 'none' end);
      fired := fired + 1;
    elsif w.expires_at <= now() then
      update public.place_watches set status = 'expired' where id = w.id;
      insert into public.notifications (user_id, kind, place_id, data, push_status)
      values (w.user_id, 'watch_expired', w.place_id, info || jsonb_build_object('level', cur.level), 'none');
      expired := expired + 1;
    end if;
  end loop;
  if fired > 0 then perform public.dispatch_pushes(); end if;
  return jsonb_build_object('fired', fired, 'expired', expired);
end $$;
revoke all on function public.check_watches() from public, anon, authenticated;
select cron.schedule('crowdmap-check-watches', '*/2 * * * *', 'select public.check_watches()');

/** For the push route: pending notifications with the recipient's devices and language. */
create function public.pending_pushes(p_limit int default 100)
returns table (id bigint, kind text, place_id uuid, data jsonb, lang text, devices jsonb)
language sql stable security definer set search_path = '' as $$
  select n.id, n.kind, n.place_id, n.data, pr.preferred_lang,
         coalesce((select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
                   from public.push_subscriptions s where s.user_id = n.user_id), '[]'::jsonb)
  from public.notifications n
  join public.profiles pr on pr.id = n.user_id
  where n.push_status = 'pending'
  order by n.id
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
$$;
revoke all on function public.pending_pushes(int) from public, anon, authenticated;
grant execute on function public.pending_pushes(int) to service_role;

/** Results from the push route: sent / failed per notification, and dead endpoints to drop. */
create function public.push_results(p_sent bigint[], p_failed bigint[], p_gone text[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.notifications set push_status = 'sent', pushed_at = now() where id = any(p_sent);
  update public.notifications set push_status = 'failed', pushed_at = now() where id = any(p_failed);
  delete from public.push_subscriptions where endpoint = any(p_gone);
  update public.push_subscriptions set last_used_at = now()
   where user_id in (select user_id from public.notifications where id = any(p_sent));
end $$;
revoke all on function public.push_results(bigint[], bigint[], text[]) from public, anon, authenticated;
grant execute on function public.push_results(bigint[], bigint[], text[]) to service_role;

-- Housekeeping: old notifications and finished watches go after 30 days.
create or replace function public.maintenance() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  presence_n int; checks_n int; flags_n int; notes_n int; watches_n int;
begin
  delete from public.presence where updated_at < now() - interval '1 hour';
  get diagnostics presence_n = row_count;
  delete from public.location_checks where at < now() - interval '90 days';
  get diagnostics checks_n = row_count;
  delete from public.bot_flags where reviewed_at < now() - interval '90 days';
  get diagnostics flags_n = row_count;
  delete from public.notifications where created_at < now() - interval '30 days';
  get diagnostics notes_n = row_count;
  delete from public.place_watches where status <> 'active' and created_at < now() - interval '30 days';
  get diagnostics watches_n = row_count;
  return jsonb_build_object('presence', presence_n, 'location_checks', checks_n, 'bot_flags', flags_n,
                            'notifications', notes_n, 'watches', watches_n);
end $$;
