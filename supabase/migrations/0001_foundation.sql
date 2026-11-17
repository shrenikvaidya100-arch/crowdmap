-- CrowdMap shared foundation: cities, places, profiles, admins, append-only audit log.
-- Shared file: change only with both users' agreement.

create extension if not exists postgis with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Cities
-- ---------------------------------------------------------------------------
create table public.cities (
  id           text primary key check (id ~ '^[a-z0-9-]+$'),
  name         text not null,
  name_hi      text,
  state        text,
  lat          double precision not null check (lat between -90 and 90),
  lng          double precision not null check (lng between -180 and 180),
  default_zoom real not null default 12,
  sort_order   int  not null default 100
);

alter table public.cities enable row level security;
revoke all on public.cities from anon, authenticated;
grant select on public.cities to anon, authenticated;
create policy cities_read on public.cities for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------------
-- Profiles (one per auth user) and admin helpers
-- ---------------------------------------------------------------------------
create table public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  display_name   text not null check (char_length(display_name) between 2 and 40),
  preferred_lang text not null default 'en' check (preferred_lang in ('en', 'hi')),
  home_city      text references public.cities(id),
  role           text not null default 'user' check (role in ('user', 'admin')),
  status         text not null default 'active' check (status in ('active', 'removed')),
  removed_at     timestamptz,
  removed_reason text,
  trust_score    real not null default 0.5 check (trust_score between 0 and 1),
  is_sample      boolean not null default false,
  created_at     timestamptz not null default now()
);

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
-- Users may change only these columns. role/status/trust are never user-writable.
grant update (display_name, preferred_lang, home_city) on public.profiles to authenticated;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and status = 'active'
  );
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

create policy profiles_read_own_or_admin on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- At most two admins, ever active at once.
create function public.enforce_admin_cap() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.role = 'admin' and (tg_op = 'INSERT' or old.role is distinct from 'admin') then
    if (select count(*) from public.profiles where role = 'admin' and id <> new.id) >= 2 then
      raise exception 'CrowdMap allows at most 2 admins';
    end if;
  end if;
  return new;
end $$;
create trigger profiles_admin_cap before insert or update of role on public.profiles
  for each row execute function public.enforce_admin_cap();

-- Create a profile for every new auth user (email or Google).
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  name text := left(trim(coalesce(
    new.raw_user_meta_data ->> 'display_name',
    new.raw_user_meta_data ->> 'full_name',
    split_part(new.email, '@', 1)
  )), 40);
begin
  if name is null or char_length(name) < 2 then name := 'User'; end if;
  insert into public.profiles (id, display_name) values (new.id, name);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Places
-- ---------------------------------------------------------------------------
create table public.places (
  id         uuid primary key default gen_random_uuid(),
  osm_type   text check (osm_type in ('node', 'way', 'relation')),
  osm_id     bigint,
  city_id    text not null references public.cities(id),
  name       text not null check (char_length(name) between 2 and 120),
  name_hi    text,
  category   text not null check (category in (
               'temple', 'religious', 'market', 'restaurant', 'cafe', 'street_food',
               'mall', 'park', 'tourist', 'hospital', 'station', 'bank', 'government',
               'education', 'entertainment', 'other')),
  lat        double precision not null check (lat between -90 and 90),
  lng        double precision not null check (lng between -180 and 180),
  location   extensions.geography(point, 4326) generated always as
               (extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography) stored,
  radius_m   int not null default 150 check (radius_m between 20 and 2000),
  address    text,
  status     text not null default 'listed' check (status in ('listed', 'unconfirmed', 'removed')),
  added_by   uuid references public.profiles(id) on delete set null,
  is_sample  boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (osm_type, osm_id)
);
create index places_location_idx on public.places using gist (location);
create index places_city_idx on public.places (city_id, status);

alter table public.places enable row level security;
revoke all on public.places from anon, authenticated;
grant select on public.places to anon, authenticated;
grant update (name, name_hi, category, radius_m, address, status) on public.places to authenticated;
create policy places_read on public.places for select to anon, authenticated
  using (status <> 'removed' or public.is_admin());
create policy places_admin_update on public.places for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
-- User-added places arrive through User 1's functions (migrations 1xxx), not direct inserts.

create function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger places_touch before update on public.places
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Audit log: append-only, hash-chained. Nobody can edit or delete rows,
-- admins included. Rows are added only through log_event / log_event_as.
-- ---------------------------------------------------------------------------
create sequence public.audit_log_seq;

create table public.audit_log (
  id          bigint primary key,
  at          timestamptz not null,
  actor_id    uuid,                -- no foreign key: deleting a user never touches the log
  actor_role  text not null check (actor_role in ('anon', 'user', 'admin', 'system')),
  action      text not null check (action ~ '^[a-z0-9_]+(\.[a-z0-9_]+)+$'),
  target_type text,
  target_id   text,
  details     jsonb not null default '{}',
  prev_hash   text not null,
  hash        text not null
);
create index audit_log_actor_idx on public.audit_log (actor_id, id desc);
create index audit_log_action_idx on public.audit_log (action, id desc);

create function public.audit_log_hash(r public.audit_log) returns text
language sql immutable set search_path = '' as $$
  select encode(extensions.digest(concat_ws('|',
    r.prev_hash, r.id::text, extract(epoch from r.at)::text, coalesce(r.actor_id::text, ''),
    r.actor_role, r.action, coalesce(r.target_type, ''), coalesce(r.target_id, ''), r.details::text
  ), 'sha256'), 'hex');
$$;

-- Serialises inserts so ids and the hash chain share one order.
create function public.audit_log_chain() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext('public.audit_log'));
  new.id := nextval('public.audit_log_seq');
  new.at := clock_timestamp();
  new.prev_hash := coalesce(
    (select hash from public.audit_log order by id desc limit 1), 'GENESIS');
  new.hash := public.audit_log_hash(new);
  return new;
end $$;
create trigger audit_log_chain before insert on public.audit_log
  for each row execute function public.audit_log_chain();

create function public.audit_log_immutable() returns trigger language plpgsql as $$
begin
  raise exception 'audit_log is append-only: % is not allowed', tg_op;
end $$;
create trigger audit_log_no_change before update or delete on public.audit_log
  for each row execute function public.audit_log_immutable();
create trigger audit_log_no_truncate before truncate on public.audit_log
  for each statement execute function public.audit_log_immutable();

alter table public.audit_log enable row level security;
revoke all on public.audit_log from anon, authenticated, service_role;
grant select on public.audit_log to authenticated, service_role;
create policy audit_read_own_or_admin on public.audit_log for select to authenticated
  using (actor_id = auth.uid() or public.is_admin());

-- Log as the signed-in caller. admin.* needs an admin; system.* is service-only.
create function public.log_event(
  p_action text, p_target_type text default null, p_target_id text default null,
  p_details jsonb default '{}'
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  uid  uuid := auth.uid();
  role text := case when uid is null then 'anon'
                    when public.is_admin() then 'admin' else 'user' end;
  new_id bigint;
begin
  if p_action like 'system.%' then raise exception 'system events are server-only'; end if;
  if p_action like 'admin.%' and role <> 'admin' then raise exception 'admin events need an admin'; end if;
  insert into public.audit_log (actor_id, actor_role, action, target_type, target_id, details, prev_hash, hash)
  values (uid, role, p_action, p_target_type, p_target_id, coalesce(p_details, '{}'), '', '')
  returning id into new_id;
  return new_id;
end $$;
revoke all on function public.log_event(text, text, text, jsonb) from public;
grant execute on function public.log_event(text, text, text, jsonb) to anon, authenticated;

-- Server pipelines (bot sweeps, failed logins) log on someone's behalf.
create function public.log_event_as(
  p_actor uuid, p_actor_role text, p_action text, p_target_type text default null,
  p_target_id text default null, p_details jsonb default '{}'
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare new_id bigint;
begin
  insert into public.audit_log (actor_id, actor_role, action, target_type, target_id, details, prev_hash, hash)
  values (p_actor, p_actor_role, p_action, p_target_type, p_target_id, coalesce(p_details, '{}'), '', '')
  returning id into new_id;
  return new_id;
end $$;
revoke all on function public.log_event_as(uuid, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.log_event_as(uuid, text, text, text, text, jsonb) to service_role;

-- Returns the first id whose hash does not match, or null if the chain is intact.
create function public.verify_audit_chain() returns bigint
language plpgsql stable security definer set search_path = '' as $$
declare r public.audit_log; expected_prev text := 'GENESIS';
begin
  if not public.is_admin() and auth.role() <> 'service_role' then
    raise exception 'admins only';
  end if;
  for r in select * from public.audit_log order by id loop
    if r.prev_hash <> expected_prev or r.hash <> public.audit_log_hash(r) then
      return r.id;
    end if;
    expected_prev := r.hash;
  end loop;
  return null;
end $$;
revoke all on function public.verify_audit_chain() from public, anon;
grant execute on function public.verify_audit_chain() to authenticated, service_role;

-- Log profile lifecycle automatically.
create function public.audit_profiles() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  actor_role text := case when auth.uid() is null then 'system'
                          when public.is_admin() then 'admin' else 'user' end;
begin
  if tg_op = 'INSERT' then
    perform public.log_event_as(new.id, 'user', 'auth.signup', 'profile', new.id::text, '{}');
  elsif new.role is distinct from old.role then
    perform public.log_event_as(actor, actor_role, 'admin.role_change', 'profile', new.id::text,
      jsonb_build_object('from', old.role, 'to', new.role));
  elsif new.status is distinct from old.status then
    perform public.log_event_as(actor, actor_role, 'admin.status_change', 'profile', new.id::text,
      jsonb_build_object('from', old.status, 'to', new.status, 'reason', new.removed_reason));
  elsif row(new.display_name, new.preferred_lang, new.home_city)
        is distinct from row(old.display_name, old.preferred_lang, old.home_city) then
    perform public.log_event_as(actor, actor_role, 'profile.update', 'profile', new.id::text, '{}');
  end if;
  return new;
end $$;
create trigger profiles_audit after insert or update on public.profiles
  for each row execute function public.audit_profiles();
