-- All of India: about fifty more cities (every state and union territory capital,
-- the big metros and the most visited towns), and Add place works anywhere in
-- India, joining the nearest city instead of needing to be within 40 km of one.

insert into public.cities (id, name, name_hi, state, lat, lng, default_zoom, sort_order) values
  ('agartala', 'Agartala', 'अगरतला', 'Tripura', 23.8315, 91.2868, 12.5, 100),
  ('agra', 'Agra', 'आगरा', 'Uttar Pradesh', 27.1767, 78.0081, 12.5, 100),
  ('ahmedabad', 'Ahmedabad', 'अहमदाबाद', 'Gujarat', 23.0225, 72.5714, 12, 100),
  ('aizawl', 'Aizawl', 'आइज़ोल', 'Mizoram', 23.7271, 92.7176, 13, 100),
  ('amritsar', 'Amritsar', 'अमृतसर', 'Punjab', 31.6340, 74.8723, 12.5, 100),
  ('bengaluru', 'Bengaluru', 'बेंगलुरु', 'Karnataka', 12.9716, 77.5946, 11.5, 100),
  ('bhopal', 'Bhopal', 'भोपाल', 'Madhya Pradesh', 23.2599, 77.4126, 12, 100),
  ('bhubaneswar', 'Bhubaneswar', 'भुवनेश्वर', 'Odisha', 20.2961, 85.8245, 12, 100),
  ('chandigarh', 'Chandigarh', 'चंडीगढ़', 'Chandigarh', 30.7333, 76.7794, 12.5, 100),
  ('chennai', 'Chennai', 'चेन्नई', 'Tamil Nadu', 13.0827, 80.2707, 11.5, 100),
  ('coimbatore', 'Coimbatore', 'कोयंबटूर', 'Tamil Nadu', 11.0168, 76.9558, 12, 100),
  ('dehradun', 'Dehradun', 'देहरादून', 'Uttarakhand', 30.3165, 78.0322, 12.5, 100),
  ('gangtok', 'Gangtok', 'गंगटोक', 'Sikkim', 27.3389, 88.6065, 13, 100),
  ('goa', 'Goa (Panaji)', 'गोवा (पणजी)', 'Goa', 15.4909, 73.8278, 12, 100),
  ('gurugram', 'Gurugram', 'गुरुग्राम', 'Haryana', 28.4595, 77.0266, 12.5, 100),
  ('guwahati', 'Guwahati', 'गुवाहाटी', 'Assam', 26.1445, 91.7362, 12, 100),
  ('hyderabad', 'Hyderabad', 'हैदराबाद', 'Telangana', 17.3850, 78.4867, 11.5, 100),
  ('imphal', 'Imphal', 'इंफाल', 'Manipur', 24.8170, 93.9368, 12.5, 100),
  ('itanagar', 'Itanagar', 'ईटानगर', 'Arunachal Pradesh', 27.0844, 93.6053, 13, 100),
  ('jaipur', 'Jaipur', 'जयपुर', 'Rajasthan', 26.9124, 75.7873, 12, 100),
  ('jammu', 'Jammu', 'जम्मू', 'Jammu and Kashmir', 32.7266, 74.8570, 12.5, 100),
  ('jodhpur', 'Jodhpur', 'जोधपुर', 'Rajasthan', 26.2389, 73.0243, 12.5, 100),
  ('kanpur', 'Kanpur', 'कानपुर', 'Uttar Pradesh', 26.4499, 80.3319, 12.5, 100),
  ('kochi', 'Kochi', 'कोच्चि', 'Kerala', 9.9312, 76.2673, 12, 100),
  ('kohima', 'Kohima', 'कोहिमा', 'Nagaland', 25.6751, 94.1086, 13, 100),
  ('kolkata', 'Kolkata', 'कोलकाता', 'West Bengal', 22.5726, 88.3639, 11.5, 100),
  ('leh', 'Leh', 'लेह', 'Ladakh', 34.1526, 77.5771, 13, 100),
  ('lucknow', 'Lucknow', 'लखनऊ', 'Uttar Pradesh', 26.8467, 80.9462, 12, 100),
  ('madurai', 'Madurai', 'मदुरै', 'Tamil Nadu', 9.9252, 78.1198, 12.5, 100),
  ('mysuru', 'Mysuru', 'मैसूरु', 'Karnataka', 12.2958, 76.6394, 12.5, 100),
  ('nagpur', 'Nagpur', 'नागपुर', 'Maharashtra', 21.1458, 79.0882, 12, 100),
  ('noida', 'Noida', 'नोएडा', 'Uttar Pradesh', 28.5355, 77.3910, 12.5, 100),
  ('patna', 'Patna', 'पटना', 'Bihar', 25.5941, 85.1376, 12, 100),
  ('port-blair', 'Port Blair', 'पोर्ट ब्लेयर', 'Andaman and Nicobar Islands', 11.6234, 92.7265, 13, 100),
  ('puducherry', 'Puducherry', 'पुदुच्चेरी', 'Puducherry', 11.9416, 79.8083, 13, 100),
  ('pune', 'Pune', 'पुणे', 'Maharashtra', 18.5204, 73.8567, 12, 100),
  ('raipur', 'Raipur', 'रायपुर', 'Chhattisgarh', 21.2514, 81.6296, 12.5, 100),
  ('ranchi', 'Ranchi', 'रांची', 'Jharkhand', 23.3441, 85.3096, 12.5, 100),
  ('shillong', 'Shillong', 'शिलांग', 'Meghalaya', 25.5788, 91.8933, 13, 100),
  ('shimla', 'Shimla', 'शिमला', 'Himachal Pradesh', 31.1048, 77.1734, 13, 100),
  ('srinagar', 'Srinagar', 'श्रीनगर', 'Jammu and Kashmir', 34.0837, 74.7973, 12.5, 100),
  ('surat', 'Surat', 'सूरत', 'Gujarat', 21.1702, 72.8311, 12, 100),
  ('thiruvananthapuram', 'Thiruvananthapuram', 'तिरुवनंतपुरम', 'Kerala', 8.5241, 76.9366, 12.5, 100),
  ('tirupati', 'Tirupati', 'तिरुपति', 'Andhra Pradesh', 13.6288, 79.4192, 13, 100),
  ('udaipur', 'Udaipur', 'उदयपुर', 'Rajasthan', 24.5854, 73.7125, 12.5, 100),
  ('ujjain', 'Ujjain', 'उज्जैन', 'Madhya Pradesh', 23.1765, 75.7885, 13, 100),
  ('vadodara', 'Vadodara', 'वडोदरा', 'Gujarat', 22.3072, 73.1812, 12.5, 100),
  ('varanasi', 'Varanasi', 'वाराणसी', 'Uttar Pradesh', 25.3176, 82.9739, 12.5, 100),
  ('vijayawada', 'Vijayawada', 'विजयवाड़ा', 'Andhra Pradesh', 16.5062, 80.6480, 12.5, 100),
  ('visakhapatnam', 'Visakhapatnam', 'विशाखापत्तनम', 'Andhra Pradesh', 17.6868, 83.2185, 12, 100)
on conflict (id) do nothing;

-- Launch cities first, then the rest by name.
update public.cities c set sort_order = 10 + r.n
from (select id, row_number() over (order by name) n from public.cities where id not in ('indore', 'delhi', 'mumbai')) r
where c.id = r.id;

create or replace function public.add_place(
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

  -- Anywhere in India: inside its bounding box and within 300 km of a CrowdMap
  -- city (which keeps out Sri Lanka and most of the neighbours). The place joins
  -- the nearest city.
  if p_lat not between 6 and 37.6 or p_lng not between 68 and 97.5 then
    return jsonb_build_object('ok', false, 'reason', 'outside_cities');
  end if;
  select c.id into city from public.cities c
  where extensions.st_dwithin(extensions.st_setsrid(extensions.st_makepoint(c.lng, c.lat), 4326)::extensions.geography, pt, 300000)
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
