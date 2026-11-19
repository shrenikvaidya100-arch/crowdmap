-- IIM Indore campus: every place on campus (hostels, messes, blocks, classrooms,
-- courts…) goes up a crowd stage for every 3 people sharing location there, like
-- D-303. Elsewhere the per-category thresholds stay as they are.

create or replace function public.place_presence_floor(p_place uuid, p_here int) returns int
language sql stable security definer set search_path = '' as $$
  select case
    when p.address like '%IIM Indore campus%' or p.name = 'Indian Institute of Management Indore' then
      case when p_here >= 3 then least(5, 2 + p_here / 3)::int end
    else public.presence_floor(p.category, p_here) end
  from public.places p where p.id = p_place;
$$;
revoke all on function public.place_presence_floor(uuid, int) from public;
grant execute on function public.place_presence_floor(uuid, int) to anon, authenticated;

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
           public.place_presence_floor(p_place, public.here_now(p_place)) as floor
  )
  select greatest(lvl.level, pres.floor)::real, lvl.weight::real, lvl.reports, lvl.last_report_at, pres.here
  from lvl, pres
  where lvl.level is not null or pres.floor is not null;
$$;
