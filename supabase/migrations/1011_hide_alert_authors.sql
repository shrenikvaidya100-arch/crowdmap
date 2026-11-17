-- User 1: fix. Any signed-in user could read quick_reports.user_id on active
-- alerts (alerts are public), which revealed who posted them. Found by User 2's
-- My activity tests. Authors are now private; owners read their own alerts
-- through my_quick_reports(), and the place panel's "mine" flag already comes
-- from place_details() (security definer).

revoke select (user_id) on public.quick_reports from authenticated;

/** The caller's own alerts with place names (for My activity). */
create function public.my_quick_reports()
returns table (
  id uuid, kind text, created_at timestamptz, expires_at timestamptz, still_there int, gone int,
  place_id uuid, place_name text, place_name_hi text, city_id text
)
language sql stable security definer set search_path = '' as $$
  select q.id, q.kind, q.created_at, q.expires_at, q.still_there, q.gone,
         q.place_id, p.name, p.name_hi, coalesce(p.city_id, q.city_id)
  from public.quick_reports q left join public.places p on p.id = q.place_id
  where q.user_id = auth.uid()
  order by q.created_at desc
  limit 500;
$$;
revoke all on function public.my_quick_reports() from public, anon;
grant execute on function public.my_quick_reports() to authenticated;
