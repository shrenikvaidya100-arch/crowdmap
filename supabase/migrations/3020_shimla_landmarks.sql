-- Shimla: the OpenStreetMap import gave 115 places (restaurants, dhabas, cafés,
-- temples, banks, hospitals…). These are the landmarks it didn't include, with
-- positions from OpenStreetMap (Photon), checked by hand. Added once.
insert into public.places (city_id, name, category, lat, lng, radius_m, address)
select 'shimla', v.name, v.category, v.lat, v.lng, v.radius_m, v.address
from (values
  ('The Ridge', 'tourist', 31.1047906, 77.1752833, 150, 'The Ridge, Shimla'),
  ('Mall Road', 'market', 31.1042, 77.1712, 200, 'Mall Road, Shimla'),
  ('Christ Church', 'religious', 31.1043094, 77.1760156, 60, 'The Ridge, Shimla'),
  ('Scandal Point', 'tourist', 31.1052217, 77.1725528, 60, 'Mall Road, Shimla'),
  ('Lakkar Bazaar', 'market', 31.1055597, 77.1772927, 120, 'Lakkar Bazaar, Shimla'),
  ('Lower Bazaar', 'market', 31.1039301, 77.1732864, 120, 'Lower Bazaar, Shimla'),
  ('Gaiety Theatre', 'entertainment', 31.1043, 77.1727, 50, 'Mall Road, Shimla'),
  ('Town Hall', 'government', 31.1046, 77.1736, 50, 'Mall Road, Shimla'),
  ('Viceregal Lodge (Rashtrapati Niwas)', 'tourist', 31.1037491, 77.1417455, 150, 'Observatory Hill, Shimla'),
  ('Shimla Railway Station', 'station', 31.1036, 77.1590, 120, 'Cart Road, Shimla'),
  ('ISBT Shimla (Tutikandi)', 'station', 31.0981406, 77.1508082, 120, 'Tutikandi, Shimla'),
  ('Himachal State Museum', 'tourist', 31.1031447, 77.1508283, 80, 'Chaura Maidan, Shimla'),
  ('Himalayan Bird Park', 'park', 31.102903, 77.1475157, 80, 'Shimla'),
  ('Chadwick Falls', 'park', 31.1189512, 77.1386404, 100, 'Summer Hill, Shimla'),
  ('Summer Hill', 'park', 31.1097358, 77.1381732, 200, 'Summer Hill, Shimla'),
  ('Kufri', 'tourist', 31.1006627, 77.2633837, 300, 'Kufri, near Shimla'),
  ('Simla Times', 'cafe', 31.1007587, 77.176289, 40, 'Shimla')
) as v(name, category, lat, lng, radius_m, address)
where not exists (select 1 from public.places p where p.city_id = 'shimla' and lower(p.name) = lower(v.name));
