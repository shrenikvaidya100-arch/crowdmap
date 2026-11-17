-- Launch cities are now Indore, Delhi and Mumbai (decided 2026-11-17).
-- Removes the other three cities and the places imported for them.

insert into public.cities (id, name, name_hi, state, lat, lng, default_zoom, sort_order)
values ('mumbai', 'Mumbai', 'मुंबई', 'Maharashtra', 19.0760, 72.8777, 11.5, 3)
on conflict (id) do nothing;

update public.cities set sort_order = 2 where id = 'delhi';

-- Reports and alerts on these places are removed with them (on delete cascade).
delete from public.quick_reports where city_id in ('pondicherry', 'vadodara', 'chennai');
delete from public.places where city_id in ('pondicherry', 'vadodara', 'chennai');
delete from public.cities where id in ('pondicherry', 'vadodara', 'chennai');

select public.log_event_as(null, 'system', 'system.cities_update', 'city', null,
  '{"added": ["mumbai"], "removed": ["pondicherry", "vadodara", "chennai"]}'::jsonb);
