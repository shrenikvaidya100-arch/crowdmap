-- Home page: number of listed places per city (public, no personal data).
create function public.city_place_counts()
returns table (city_id text, n int)
language sql stable security definer set search_path = '' as $$
  select city_id, count(*)::int from public.places where status <> 'removed' group by city_id;
$$;
grant execute on function public.city_place_counts() to anon, authenticated;
