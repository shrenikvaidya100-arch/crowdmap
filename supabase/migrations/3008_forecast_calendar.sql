-- Design step 14: crowd calendar. One expected level per day for the next
-- p_days days (India time), from the same hourly forecast as "Plan your visit".
-- Daily level = average of the daytime hours (8 am to 9 pm); also the quietest
-- daytime hour and any special days.

create function public.forecast_calendar(p_place uuid, p_days int default 14) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'Asia/Kolkata')::date;
  n int := least(greatest(coalesce(p_days, 14), 1), 31);
  days jsonb := '[]'::jsonb;
  f jsonb;
  d date;
begin
  if not exists (select 1 from public.places where id = p_place and status <> 'removed') then
    return null;
  end if;
  for i in 0 .. n - 1 loop
    d := today + i;
    f := public.forecast_day(p_place, d);
    days := days || jsonb_build_object(
      'date', d,
      'level', (select round(avg((h->>'level')::numeric), 2)
                  from jsonb_array_elements(f->'hours') h where (h->>'hour')::int between 8 and 21),
      'quietest', (select jsonb_build_object('hour', (h->>'hour')::int, 'level', round((h->>'level')::numeric, 2))
                     from jsonb_array_elements(f->'hours') h where (h->>'hour')::int between 8 and 21
                     order by (h->>'level')::numeric, (h->>'hour')::int limit 1),
      'special', coalesce(f->'special', '[]'::jsonb));
  end loop;
  return jsonb_build_object('from', today, 'days', days);
end $$;
revoke all on function public.forecast_calendar(uuid, int) from public;
grant execute on function public.forecast_calendar(uuid, int) to anon, authenticated;
