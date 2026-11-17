-- User 1: users add missing places without admin approval.
-- Rules: account older than 24 h and active; GPS at the spot (same checks as
-- reports); inside a launch city; no similar name within 50 m; 3 new places a day.
-- A new place is "unconfirmed" until 2 other people at the spot confirm it.
-- 2+ "doesn't exist" votes that outnumber confirmations remove it.

alter table public.location_checks drop constraint location_checks_source_check;
alter table public.location_checks add constraint location_checks_source_check
  check (source in ('crowd_report', 'quick_report', 'quick_vote', 'presence', 'add_place', 'confirm_place'));

create table public.place_confirmations (
  place_id   uuid not null references public.places(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  exists_here boolean not null,
  created_at timestamptz not null default now(),
  primary key (place_id, user_id)
);
alter table public.place_confirmations enable row level security;
revoke all on public.place_confirmations from anon, authenticated;
grant select on public.place_confirmations to authenticated;
create policy place_confirmations_read on public.place_confirmations for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

/** Default "you are here" radius per category (same as the OSM import). */
create function public.default_radius(p_category text) returns int
language sql immutable set search_path = '' as $$
  select case p_category
    when 'temple' then 100 when 'religious' then 100 when 'market' then 200 when 'restaurant' then 60
    when 'cafe' then 50 when 'street_food' then 80 when 'mall' then 150 when 'park' then 250
    when 'tourist' then 200 when 'hospital' then 150 when 'station' then 250 when 'bank' then 50
    when 'government' then 100 when 'education' then 250 when 'entertainment' then 120 else 100 end;
$$;

create function public.valid_place_name(p_name text) returns boolean
language sql immutable set search_path = '' as $$
  select p_name is not null
     and char_length(trim(p_name)) between 2 and 80
     and trim(p_name) ~ '^[[:alnum:][:space:].,''&()/#-]+$'
     and trim(p_name) ~ '[[:alpha:]]'
     and trim(p_name) !~* '(https?:|www\.|\|)';
$$;

create function public.add_place(
  p_name text, p_name_hi text, p_category text,
  p_lat double precision, p_lng double precision, p_accuracy real, p_spread real default 0
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_active_user();
  joined timestamptz;
  chk jsonb;
  city text;
  dup public.places;
  pt extensions.geography := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;
  new_id uuid;
begin
  select created_at into joined from public.profiles where id = uid;
  if joined > now() - interval '24 hours' then
    return jsonb_build_object('ok', false, 'reason', 'new_account');
  end if;
  if not public.valid_place_name(p_name) or (p_name_hi is not null and char_length(trim(p_name_hi)) > 80) then
    return jsonb_build_object('ok', false, 'reason', 'bad_name');
  end if;
  if not exists (select 1 from public.crowd_patterns where category = p_category) then
    return jsonb_build_object('ok', false, 'reason', 'bad_category');
  end if;
  if (select count(*) from public.places where added_by = uid and created_at > now() - interval '1 day') >= 3 then
    return jsonb_build_object('ok', false, 'reason', 'daily_limit');
  end if;

  chk := public.check_location(uid, p_lat, p_lng, p_accuracy, p_spread, null, null, 'add_place');
  if not (chk ->> 'ok')::boolean then
    perform public.log_event_as(uid, 'user', 'place.add_rejected', 'place', null,
      jsonb_build_object('reason', chk ->> 'reason', 'name', p_name));
    return chk;
  end if;

  select c.id into city from public.cities c
  where extensions.st_dwithin(extensions.st_setsrid(extensions.st_makepoint(c.lng, c.lat), 4326)::extensions.geography, pt, 40000)
  order by extensions.st_distance(extensions.st_setsrid(extensions.st_makepoint(c.lng, c.lat), 4326)::extensions.geography, pt)
  limit 1;
  if city is null then return jsonb_build_object('ok', false, 'reason', 'outside_cities'); end if;

  select * into dup from public.places p
  where p.status <> 'removed'
    and extensions.st_dwithin(p.location, pt, 50)
    and (extensions.similarity(lower(p.name), lower(trim(p_name))) > 0.45
         or extensions.word_similarity(lower(trim(p_name)), lower(p.name)) > 0.7)
  order by extensions.st_distance(p.location, pt) limit 1;
  if found then
    return jsonb_build_object('ok', false, 'reason', 'duplicate', 'place_id', dup.id, 'name', dup.name);
  end if;

  insert into public.places (city_id, name, name_hi, category, lat, lng, radius_m, status, added_by)
  values (city, trim(p_name), nullif(trim(p_name_hi), ''), p_category, p_lat, p_lng,
          public.default_radius(p_category), 'unconfirmed', uid)
  returning id into new_id;
  perform public.log_event_as(uid, 'user', 'place.add', 'place', new_id::text,
    jsonb_build_object('name', trim(p_name), 'category', p_category, 'city', city));
  return jsonb_build_object('ok', true, 'id', new_id, 'city_id', city);
end $$;
revoke all on function public.add_place(text, text, text, double precision, double precision, real, real) from public, anon;
grant execute on function public.add_place(text, text, text, double precision, double precision, real, real) to authenticated;

/** Someone at the spot says the new place is real (or not). */
create function public.confirm_place(
  p_place uuid, p_exists boolean, p_lat double precision, p_lng double precision, p_accuracy real, p_spread real default 0
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_active_user();
  pl public.places;
  chk jsonb;
  yes int;
  no int;
  outcome text := 'unconfirmed';
begin
  select * into pl from public.places where id = p_place;
  if not found or pl.status <> 'unconfirmed' then return jsonb_build_object('ok', false, 'reason', 'not_unconfirmed'); end if;
  if pl.added_by = uid then return jsonb_build_object('ok', false, 'reason', 'own_place'); end if;

  chk := public.check_location(uid, p_lat, p_lng, p_accuracy, p_spread, p_place, null, 'confirm_place');
  if not (chk ->> 'ok')::boolean then return chk; end if;

  insert into public.place_confirmations (place_id, user_id, exists_here) values (p_place, uid, p_exists)
    on conflict (place_id, user_id) do update set exists_here = excluded.exists_here, created_at = now();
  select count(*) filter (where exists_here), count(*) filter (where not exists_here) into yes, no
    from public.place_confirmations where place_id = p_place;

  if yes >= 2 and yes > no then
    update public.places set status = 'listed' where id = p_place;
    outcome := 'listed';
  elsif no >= 2 and no > yes then
    update public.places set status = 'removed' where id = p_place;
    outcome := 'removed';
  end if;
  perform public.log_event_as(uid, 'user', 'place.confirm', 'place', p_place::text,
    jsonb_build_object('exists', p_exists, 'yes', yes, 'no', no, 'outcome', outcome));
  if outcome <> 'unconfirmed' then
    perform public.log_event_as(null, 'system', 'system.place_' || outcome, 'place', p_place::text,
      jsonb_build_object('yes', yes, 'no', no));
  end if;
  return jsonb_build_object('ok', true, 'status', outcome, 'yes', yes, 'no', no);
end $$;
revoke all on function public.confirm_place(uuid, boolean, double precision, double precision, real, real) from public, anon;
grant execute on function public.confirm_place(uuid, boolean, double precision, double precision, real, real) to authenticated;

/** The person who added a place can fix its name/category or delete it, until it is confirmed. */
create function public.edit_my_place(p_place uuid, p_name text, p_name_hi text, p_category text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_active_user();
begin
  if not public.valid_place_name(p_name) or (p_name_hi is not null and char_length(trim(p_name_hi)) > 80) then
    return jsonb_build_object('ok', false, 'reason', 'bad_name');
  end if;
  if not exists (select 1 from public.crowd_patterns where category = p_category) then
    return jsonb_build_object('ok', false, 'reason', 'bad_category');
  end if;
  update public.places set name = trim(p_name), name_hi = nullif(trim(p_name_hi), ''), category = p_category,
                           radius_m = public.default_radius(p_category)
  where id = p_place and added_by = uid and status = 'unconfirmed';
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_editable'); end if;
  perform public.log_event_as(uid, 'user', 'place.edit', 'place', p_place::text,
    jsonb_build_object('name', trim(p_name), 'category', p_category));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.edit_my_place(uuid, text, text, text) from public, anon;
grant execute on function public.edit_my_place(uuid, text, text, text) to authenticated;

create function public.delete_my_place(p_place uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_active_user();
begin
  -- Soft delete keeps reports and the audit trail consistent.
  update public.places set status = 'removed'
  where id = p_place and added_by = uid and status = 'unconfirmed';
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_editable'); end if;
  perform public.log_event_as(uid, 'user', 'place.delete', 'place', p_place::text, '{}');
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.delete_my_place(uuid) from public, anon;
grant execute on function public.delete_my_place(uuid) to authenticated;

-- Map and panel now show whether a place is confirmed.
create or replace function public.crowd_map(p_city text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'places', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'name_hi', p.name_hi, 'category', p.category,
        'lat', p.lat, 'lng', p.lng, 'status', p.status,
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

create or replace function public.place_details(p_place uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'place', jsonb_build_object('id', p.id, 'name', p.name, 'name_hi', p.name_hi, 'category', p.category,
                                'address', p.address, 'lat', p.lat, 'lng', p.lng, 'radius_m', p.radius_m,
                                'city_id', p.city_id, 'osm_type', p.osm_type, 'osm_id', p.osm_id,
                                'status', p.status, 'added_by_me', p.added_by = auth.uid()),
    'confirmations', jsonb_build_object(
      'yes', (select count(*) from public.place_confirmations c where c.place_id = p.id and c.exists_here),
      'no', (select count(*) from public.place_confirmations c where c.place_id = p.id and not c.exists_here),
      'mine', (select c.exists_here from public.place_confirmations c where c.place_id = p.id and c.user_id = auth.uid())),
    'crowd', jsonb_build_object(
      'level', round(coalesce(l.level, public.estimated_level(p.id, p.category)))::int,
      'source', case when l.level is not null then 'live' else 'estimated' end,
      'reports', coalesce(l.reports, 0), 'last_report_at', l.last_report_at),
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
