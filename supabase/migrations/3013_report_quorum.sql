-- Trust: one person can't set a place's crowd level on their own.
-- * A place goes "live" only when at least two different people reported in the
--   last 90 minutes (sample/demo rows count as separate people). Until then it
--   shows its usual estimate, marked "1 report, waiting for a second person".
-- * Two people who disagree wildly (3+ levels apart) don't make it live either.
--   With three or more, the weighted median is used, so one false report (say
--   "Empty" to send people away, or "Packed" to keep them out) can't drag it.
-- * Quick alerts change the crowd level only once someone else confirms them.
-- * nearby_pending(): places near you with a report waiting for a second person,
--   so the app can ask people who are there to confirm.
-- * admin_dashboard(): daily numbers for the admin charts.

create or replace function public.live_level(p_place uuid)
returns table (level real, weight real, reports int, last_report_at timestamptz, here int)
language sql stable security definer set search_path = '' as $$
  with w as (
    select r.level, r.created_at,
           coalesce(r.user_id::text, 'sample:' || r.id::text) as who,
           exp(-extract(epoch from now() - r.created_at) / 1800.0)
             * case when r.is_sample then 0.6 else 0.5 + coalesce(pr.trust_score, 0.5) end as weight
    from public.crowd_reports r
    left join public.profiles pr on pr.id = r.user_id
    where r.place_id = p_place
      and r.created_at > now() - interval '90 minutes'
      and (r.is_sample or pr.status = 'active')
  ), per as (
    -- Each person counts once: their latest report.
    select distinct on (who) who, level, weight, created_at from w order by who, created_at desc
  ), stats as (
    select count(*)::int as people, sum(weight) as wsum, max(level) - min(level) as spread,
           sum(level * weight) / nullif(sum(weight), 0) as mean
    from per
  ), med as (
    select x.level from (
      select level, sum(weight) over (order by level, created_at) as cum, sum(weight) over () as tot from per
    ) x where x.cum >= x.tot / 2 order by x.cum limit 1
  ), q as (
    -- Alerts move the level only when confirmed by someone else (or sample data).
    select coalesce(sum(k.crowd_effect), 0) as nudge
    from public.quick_reports qr join public.quick_report_kinds k using (kind)
    where qr.place_id = p_place and qr.expires_at > now() and (qr.is_sample or qr.still_there >= 1)
  ), rep as (
    select case
             when s.people >= 3 and s.wsum >= 0.3 then (select level from med)
             when s.people = 2 and s.spread <= 2 and s.wsum >= 0.3 then s.mean
           end as base,
           s.wsum as weight,
           (select count(*)::int from w) as reports,
           (select max(created_at) from w) as last_report_at
    from stats s
  ), lvl as (
    select case when base is null then null
                else greatest(1, least(5, base + (select nudge from q) * 0.5)) end as level,
           weight, reports, last_report_at
    from rep
  ), pres as (
    select public.here_now(p_place) as here,
           public.presence_floor((select category from public.places where id = p_place), public.here_now(p_place)) as floor
  )
  select greatest(lvl.level, pres.floor)::real, lvl.weight::real, lvl.reports, lvl.last_report_at, pres.here
  from lvl, pres
  where lvl.level is not null or pres.floor is not null;
$$;

/** A report waiting for a second person at this place, if any (for the place panel). */
create or replace function public.pending_report(p_place uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when not exists (select 1 from public.live_level(p_place) l where l.reports > 0) then (
    select jsonb_build_object('level', r.level, 'at', r.created_at, 'mine', coalesce(r.user_id = auth.uid(), false))
    from public.crowd_reports r join public.profiles pr on pr.id = r.user_id
    where r.place_id = p_place and not r.is_sample and pr.status = 'active'
      and r.created_at > now() - interval '45 minutes'
    order by r.created_at desc limit 1) end;
$$;
grant execute on function public.pending_report(uuid) to anon, authenticated;

-- Places near a point with a report waiting for a second person (not the caller's own).
create or replace function public.nearby_pending(p_lat double precision, p_lng double precision, p_radius_m int default 500)
returns jsonb
language sql stable security definer set search_path = '' as $$
  with me as (select extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography as g),
  near as (
    select p.id, p.name, p.name_hi, p.category, p.lat, p.lng,
           extensions.st_distance(p.location, (select g from me)) as d
    from public.places p
    where p.status <> 'removed'
      and extensions.st_dwithin(p.location, (select g from me), least(greatest(coalesce(p_radius_m, 500), 50), 2000))
  ), waiting as (
    select n.*, r.level, r.created_at
    from near n
    cross join lateral (
      select r.level, r.created_at from public.crowd_reports r join public.profiles pr on pr.id = r.user_id
      where r.place_id = n.id and not r.is_sample and pr.status = 'active'
        and r.created_at > now() - interval '45 minutes'
        and r.user_id is distinct from auth.uid()
      order by r.created_at desc limit 1) r
    where not exists (select 1 from public.live_level(n.id) l where l.reports > 0)
      and not exists (select 1 from public.crowd_reports mine where mine.place_id = n.id
                      and mine.user_id = auth.uid() and mine.created_at > now() - interval '45 minutes')
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'name', name, 'name_hi', name_hi, 'category', category, 'lat', lat, 'lng', lng,
      'distance_m', round(d)::int, 'level', level, 'at', created_at) order by d), '[]'::jsonb)
  from (select * from waiting order by d limit 5) x;
$$;
grant execute on function public.nearby_pending(double precision, double precision, int) to anon, authenticated;

create or replace function public.crowd_map(p_city text)
returns jsonb
language sql stable security definer set search_path = '' as $$
  with here as (
    select pr.place_id as id, count(*)::int as n from public.presence pr
    where pr.city_id = p_city and pr.updated_at > now() - interval '10 minutes' and pr.place_id is not null
    group by 1
  ), active as (
    select r.place_id as id from public.crowd_reports r
      join public.places p on p.id = r.place_id
      where p.city_id = p_city and r.created_at > now() - interval '90 minutes'
    union
    select q.place_id from public.quick_reports q
      where q.city_id = p_city and q.expires_at > now() and q.place_id is not null
    union
    select id from here
  ), live as (
    select a.id, l.level, l.reports, public.sample_only(a.id) as sample
    from active a cross join lateral public.live_level(a.id) l
  ), pending as (
    -- Reported in the last 45 minutes but not yet confirmed by a second person.
    select distinct r.place_id as id from public.crowd_reports r join public.places p on p.id = r.place_id
    where p.city_id = p_city and r.created_at > now() - interval '45 minutes' and not r.is_sample
      and not exists (select 1 from live where live.id = r.place_id)
  ), pat as (
    -- Same as estimated_level(): this hour's typical level per category (India time).
    select c.category,
           (case when extract(isodow from now() at time zone 'Asia/Kolkata') in (6, 7)
                 then coalesce(c.weekend, c.weekday) else c.weekday end)
             [extract(hour from now() at time zone 'Asia/Kolkata')::int + 1] as base
    from public.crowd_patterns c
  )
  select jsonb_build_object(
    'places', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'name_hi', p.name_hi, 'category', p.category,
        'lat', round(p.lat::numeric, 5), 'lng', round(p.lng::numeric, 5), 'status', p.status,
        'level', round(coalesce(l.level, greatest(1, least(5,
                   coalesce(pc.base, po.base) + ((abs(hashtext(p.id::text)) % 5) - 2) * 0.25))))::int,
        'source', case when l.level is not null then 'live' else 'estimated' end,
        'sample', coalesce(l.sample, false),
        'reports', coalesce(l.reports, 0), 'here', coalesce(h.n, 0),
        'pending', pe.id is not null))
      from public.places p
      left join live l on l.id = p.id
      left join here h on h.id = p.id
      left join pending pe on pe.id = p.id
      left join pat pc on pc.category = p.category
      left join pat po on po.category = 'other'
      where p.city_id = p_city and p.status <> 'removed'), '[]'::jsonb),
    'alerts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', q.id, 'kind', q.kind, 'place_id', q.place_id,
        'lat', round(q.lat::numeric, 5), 'lng', round(q.lng::numeric, 5), 'sample', q.is_sample,
        'still_there', q.still_there, 'gone', q.gone, 'created_at', q.created_at, 'expires_at', q.expires_at))
      from public.quick_reports q where q.city_id = p_city and q.expires_at > now()), '[]'::jsonb),
    'generated_at', now());
$$;

-- Place panel: say when a report is waiting for a second person.
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
      'sample', l.level is not null and public.sample_only(p.id),
      'reports', coalesce(l.reports, 0), 'last_report_at', l.last_report_at,
      'here', public.here_now(p.id)),
    'alerts', coalesce((select jsonb_agg(jsonb_build_object(
        'id', q.id, 'kind', q.kind, 'still_there', q.still_there, 'gone', q.gone, 'sample', q.is_sample,
        'created_at', q.created_at, 'expires_at', q.expires_at, 'mine', q.user_id = auth.uid())
        order by q.created_at desc)
      from public.quick_reports q where q.place_id = p.id and q.expires_at > now()), '[]'::jsonb),
    'my_report', (select jsonb_build_object('id', r.id, 'level', r.level, 'created_at', r.created_at,
                    'editable', r.created_at > now() - interval '15 minutes')
                  from public.crowd_reports r
                  where r.place_id = p.id and r.user_id = auth.uid()
                  order by r.created_at desc limit 1),
    'pending', public.pending_report(p.id),
    'signed_in', auth.uid() is not null)
  from public.places p
  left join lateral public.live_level(p.id) l on true
  where p.id = p_place and p.status <> 'removed';
$$;

-- Admin charts: daily numbers for the last p_days days (India time), plus splits.
create or replace function public.admin_dashboard(p_days int default 30) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_days int := least(greatest(coalesce(p_days, 30), 7), 180);
  since date := (now() at time zone 'Asia/Kolkata')::date - (v_days - 1);
begin
  perform public.require_admin();
  return jsonb_build_object(
    'days', (
      select jsonb_agg(jsonb_build_object(
        'day', d::date,
        'reports', (select count(*) from public.crowd_reports r where not r.is_sample and (r.created_at at time zone 'Asia/Kolkata')::date = d),
        'rejected', (select count(*) from public.location_checks c where not c.accepted and (c.at at time zone 'Asia/Kolkata')::date = d),
        'signups', (select count(*) from public.profiles p where not p.is_sample and (p.created_at at time zone 'Asia/Kolkata')::date = d),
        'uploads', (select count(*) from public.media m where (m.created_at at time zone 'Asia/Kolkata')::date = d),
        'alerts', (select count(*) from public.quick_reports q where not q.is_sample and (q.created_at at time zone 'Asia/Kolkata')::date = d),
        'searches', (select count(*) from public.search_log s where (s.at at time zone 'Asia/Kolkata')::date = d),
        'moderation', (select count(*) from public.audit_log a where a.actor_role = 'admin' and (a.at at time zone 'Asia/Kolkata')::date = d)
      ) order by d)
      from generate_series(since, (now() at time zone 'Asia/Kolkata')::date, interval '1 day') d),
    'levels', (
      select jsonb_object_agg(level, cnt) from (
        select level, count(*) as cnt from public.crowd_reports
        where not is_sample and created_at > now() - make_interval(days => v_days) group by level) x),
    'cities', (
      select coalesce(jsonb_agg(jsonb_build_object('city', name, 'reports', cnt) order by cnt desc), '[]'::jsonb) from (
        select c.name, count(*) as cnt from public.crowd_reports r
        join public.places p on p.id = r.place_id join public.cities c on c.id = p.city_id
        where not r.is_sample and r.created_at > now() - make_interval(days => v_days)
        group by c.name order by cnt desc limit 8) x),
    'quorum', jsonb_build_object(
      'confirmed', (select count(distinct r.place_id) from public.crowd_reports r
                    where not r.is_sample and r.created_at > now() - interval '90 minutes'
                      and exists (select 1 from public.live_level(r.place_id) l where l.reports > 0)),
      'waiting', (select count(distinct r.place_id) from public.crowd_reports r
                  where not r.is_sample and r.created_at > now() - interval '45 minutes'
                    and not exists (select 1 from public.live_level(r.place_id) l where l.reports > 0))));
end $$;
revoke all on function public.admin_dashboard(int) from public, anon;
grant execute on function public.admin_dashboard(int) to authenticated;
