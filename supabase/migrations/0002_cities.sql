-- Launch cities. Indore is the primary demo city.
insert into public.cities (id, name, name_hi, state, lat, lng, default_zoom, sort_order) values
  ('indore',      'Indore',      'इंदौर',      'Madhya Pradesh', 22.7196, 75.8577, 12.5, 1),
  ('pondicherry', 'Pondicherry', 'पुदुच्चेरी',  'Puducherry',     11.9416, 79.8083, 13,   2),
  ('vadodara',    'Vadodara',    'वडोदरा',     'Gujarat',        22.3072, 73.1812, 12.5, 3),
  ('chennai',     'Chennai',     'चेन्नई',      'Tamil Nadu',     13.0827, 80.2707, 11.5, 4),
  ('delhi',       'Delhi',       'दिल्ली',      'Delhi',          28.6139, 77.2090, 11,   5)
on conflict (id) do nothing;
