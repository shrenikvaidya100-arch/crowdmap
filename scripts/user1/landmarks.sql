-- Hand corrections for well-known places where OpenStreetMap's tags don't
-- match how people use them. Safe to re-run.
-- Run: node --env-file=.env.local scripts/user1/run-sql.mjs scripts/user1/landmarks.sql

-- Sarafa Bazaar is Indore's night food street, not just a sight.
update public.places set category = 'street_food', radius_m = 250
where city_id = 'indore' and name = 'Sarafa Bazaar';

-- Chappan Dukan (56 shops food street) is missing from the import.
insert into public.places (city_id, name, name_hi, category, lat, lng, radius_m, address, status)
select 'indore', 'Chappan Dukan (56 Dukan)', 'छप्पन दुकान', 'street_food', 22.7243, 75.8838, 150, 'New Palasia', 'listed'
where not exists (select 1 from public.places where city_id = 'indore' and name ilike '%56 dukan%');

-- Wider radius for big landmarks.
update public.places set radius_m = 200 where city_id = 'indore' and name in ('Rajwada Palace', 'Khajrana Ganesh Mandir');
