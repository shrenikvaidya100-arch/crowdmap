-- IIM Indore campus in detail: every hostel, mess, block, café, court and gate,
-- not just one dot for the whole campus. Positions come from the IPM Portal
-- campus map (map.ipmportal.in) and the institute's campus map (PDF), matched
-- against each other. A new "hostel" category gets its own daily pattern.

alter table public.places drop constraint places_category_check;
alter table public.places add constraint places_category_check check (category in (
  'temple', 'religious', 'market', 'restaurant', 'cafe', 'street_food',
  'mall', 'park', 'tourist', 'hospital', 'station', 'bank', 'government',
  'education', 'entertainment', 'hostel', 'other'));

-- Hostels: busiest around breakfast and late evening, quiet in class hours.
insert into public.crowd_patterns (category, weekday, weekend) values
  ('hostel', '{3,2,2,1,1,1,2,3,3,2,2,2,2,2,2,2,2,2,3,3,4,4,4,3}', '{3,2,2,1,1,1,1,2,2,3,3,3,3,3,3,3,3,3,3,3,4,4,4,3}')
on conflict (category) do nothing;

-- Added once: a place already listed with the same name within ~60 m is skipped.
insert into public.places (city_id, name, category, lat, lng, radius_m, address)
select 'indore', v.name, v.category, v.lat, v.lng, v.radius_m, v.address
from (values
  ('SR 18', 'hostel', 22.625808, 75.788543, 40, 'Student Residence (hostel), IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('Cricket Stadium', 'entertainment', 22.626192, 75.786465, 120, 'Sports & events, IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('SR 16A', 'hostel', 22.626528, 75.788408, 40, 'Student Residence (hostel), IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('SR 16B', 'hostel', 22.626895, 75.788576, 40, 'Student Residence (hostel), IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('SR 19', 'hostel', 22.626925, 75.788165, 40, 'Student Residence (hostel), IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('SR 15', 'hostel', 22.626852, 75.787796, 40, 'Student Residence (hostel), IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('SR 17', 'hostel', 22.625636, 75.787843, 40, 'Student Residence (hostel), IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('SR 20', 'hostel', 22.625606, 75.788174, 40, 'Student Residence (hostel), IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('Mess 4', 'restaurant', 22.626412, 75.788029, 40, 'Student mess, IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('Mess 5', 'restaurant', 22.626046, 75.788043, 40, 'Student mess, IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('Football Turf', 'entertainment', 22.625149, 75.789037, 120, 'Sports & events, IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('Basketball Court', 'entertainment', 22.623569, 75.792003, 60, 'Sports & events, IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('Tennis Court', 'entertainment', 22.628456, 75.788728, 60, 'Sports & events, IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('Sports Complex & Gym', 'entertainment', 22.628243, 75.788463, 60, 'Sports & events, IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('Swimming Pool', 'entertainment', 22.628608, 75.788359, 60, 'Sports & events, IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('Events Court', 'entertainment', 22.628361, 75.787941, 60, 'Sports & events, IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('New Auditorium', 'entertainment', 22.62861, 75.787785, 60, 'Sports & events, IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('Padel Ball Court', 'entertainment', 22.627845, 75.78858, 60, 'Sports & events, IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('Main Gate (Gate No. 1)', 'other', 22.63114, 75.792071, 40, 'IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('Dog Shelter', 'other', 22.631079, 75.79276, 40, 'IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('Academic Block', 'education', 22.627034, 75.79123, 40, 'Academic area, IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('Golden Arches', 'education', 22.626908, 75.790482, 40, 'Academic area, IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('D-Block', 'education', 22.627649, 75.791533, 40, 'Academic area, IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('E-Block', 'education', 22.627522, 75.791825, 40, 'Academic area, IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('F-Block', 'education', 22.627211, 75.79196, 40, 'Academic area, IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('G-Block', 'education', 22.626835, 75.791931, 40, 'Academic area, IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('I-Block', 'education', 22.626403, 75.791507, 40, 'Academic area, IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('C-Block', 'education', 22.62777, 75.79127, 40, 'Academic area, IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('B-Block', 'education', 22.627699, 75.790949, 40, 'Academic area, IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('A-Block', 'education', 22.627566, 75.790683, 40, 'Academic area, IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('Photocopy Shop', 'market', 22.627664, 75.79131, 40, 'IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('DPM Residence (FPM)', 'hostel', 22.624344, 75.789767, 40, 'Student residence, IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('Mess 1', 'restaurant', 22.625144, 75.791248, 40, 'Student mess, IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('Sardar Ji ka Dhaba', 'restaurant', 22.624217, 75.791743, 40, 'Food, IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('Khuraak', 'restaurant', 22.624253, 75.791819, 40, 'Food, IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('Jain Kitchen', 'restaurant', 22.624353, 75.791628, 40, 'Food, IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('Mess 2', 'restaurant', 22.624373, 75.791755, 40, 'Student mess, IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('Mess 3', 'restaurant', 22.62368, 75.793196, 40, 'Student mess, IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('Old Auditorium', 'entertainment', 22.625901, 75.789713, 60, 'Sports & events, IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('Transport Office', 'other', 22.625859, 75.789824, 40, 'IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('Post Office', 'government', 22.625927, 75.789849, 40, 'IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('SBI Branch', 'bank', 22.626001, 75.78983, 40, 'IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('Learning Centre (Library)', 'education', 22.625691, 75.790595, 40, 'Academic area, IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('Juicilicious Cafe', 'cafe', 22.627014, 75.788658, 40, 'Café, IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('Hostel Reception Center (HRC)', 'other', 22.624754, 75.790974, 40, 'IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('SR 10', 'hostel', 22.624738, 75.79232, 40, 'Student Residence (hostel), IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('Domino''s Pizza', 'restaurant', 22.624785, 75.792217, 40, 'Food, IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('Indrani Restaurant', 'restaurant', 22.624696, 75.792504, 40, 'Food, IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('Chick n Serve', 'restaurant', 22.624654, 75.79247, 40, 'Food, IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('Nescafe', 'cafe', 22.624608, 75.792437, 40, 'Café, IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('Mars', 'cafe', 22.624568, 75.792395, 40, 'Café, IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('Khichdi Nation', 'restaurant', 22.624995, 75.792186, 40, 'Food, IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('Married Residence 01', 'hostel', 22.624446, 75.792143, 40, 'Student residence, IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('SR 11', 'hostel', 22.623937, 75.792748, 40, 'Student Residence (hostel), IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('SR 12', 'hostel', 22.62361, 75.792641, 40, 'Student Residence (hostel), IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('SR 13', 'hostel', 22.624156, 75.793247, 40, 'Student Residence (hostel), IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('SR 14', 'hostel', 22.624009, 75.793648, 40, 'Student Residence (hostel), IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('SR 02', 'hostel', 22.62432, 75.791211, 40, 'Student Residence (hostel), IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('SR 03', 'hostel', 22.624636, 75.791395, 40, 'Student Residence (hostel), IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('SR 01', 'hostel', 22.624916, 75.791023, 40, 'Student Residence (hostel), IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('SR 04', 'hostel', 22.625384, 75.791664, 40, 'Student Residence (hostel), IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('SR 05', 'hostel', 22.625279, 75.792026, 40, 'Student Residence (hostel), IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('SR 06', 'hostel', 22.624931, 75.791931, 40, 'Student Residence (hostel), IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('SR 07', 'hostel', 22.625591, 75.792444, 40, 'Student Residence (hostel), IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('SR 08', 'hostel', 22.625506, 75.79287, 40, 'Student Residence (hostel), IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('Medical Center', 'hospital', 22.625976, 75.792956, 40, 'IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('The Pi Shop', 'market', 22.625818, 75.792648, 40, 'IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('KK Traders', 'market', 22.62573, 75.79271, 40, 'IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('Type V Faculty Houses', 'other', 22.625725, 75.794335, 40, 'IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('Director''s Residence', 'other', 22.626998, 75.793241, 40, 'IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('J-Block', 'education', 22.626605, 75.790912, 40, 'Academic area, IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('K-Block', 'education', 22.626819, 75.790658, 40, 'Academic area, IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('L-Block', 'education', 22.627068, 75.790588, 40, 'Academic area, IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('Reception', 'other', 22.626923, 75.79062, 40, 'IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('SBI ATM', 'bank', 22.626869, 75.790767, 40, 'IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('Spiritual Garden', 'park', 22.627249, 75.792389, 60, 'IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('Jabreshwar Mahadev Temple', 'temple', 22.626102, 75.791783, 40, 'IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('Executive Residence 04', 'hostel', 22.626013, 75.792533, 40, 'Student residence, IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('SR 09', 'hostel', 22.625151, 75.792825, 40, 'Student Residence (hostel), IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('Executive Residence 03', 'hostel', 22.624487, 75.790557, 40, 'Student residence, IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('EPGP Hostel', 'hostel', 22.624242, 75.790697, 40, 'Student residence, IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('Executive Residence 02', 'hostel', 22.628738, 75.790557, 40, 'Student residence, IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('SRC Block', 'education', 22.628776, 75.790983, 40, 'Academic area, IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('Executive Residence 01 (MDC)', 'hostel', 22.628366, 75.7915, 40, 'Student residence, IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('Badminton Court', 'entertainment', 22.627051, 75.795452, 60, 'Sports & events, IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('Volleyball Court', 'entertainment', 22.625297, 75.792635, 60, 'Sports & events, IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('Avani Foods', 'restaurant', 22.624928, 75.792466, 40, 'Food, IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('Gate No. 2', 'other', 22.626834, 75.795875, 40, 'IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('Tennis Court (Faculty)', 'entertainment', 22.626722, 75.795191, 60, 'Sports & events, IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('The IKIGAI Salon', 'other', 22.625751, 75.792464, 40, 'IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('Skating Rink', 'entertainment', 22.626411, 75.795734, 60, 'Sports & events, IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('Visiting Faculty Apartment', 'other', 22.628265, 75.793233, 40, 'IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('Planet-I Junction', 'cafe', 22.624804, 75.79241, 40, 'Café, IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('Finance Lab', 'education', 22.626408, 75.791206, 40, 'Academic area, IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('Computer Lab', 'education', 22.626459, 75.791207, 40, 'Academic area, IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('Lake', 'park', 22.627736, 75.786891, 120, 'IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('Gate No. 3', 'other', 22.628215, 75.786231, 40, 'IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('Type III Apartments', 'other', 22.627705, 75.794673, 40, 'IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('Type IV Apartments', 'other', 22.627152, 75.794923, 40, 'IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('Children''s Park', 'park', 22.62642, 75.79524, 60, 'IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('Gandhi Park', 'park', 22.626338, 75.795537, 60, 'IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('Administrative Building', 'other', 22.625542, 75.789947, 40, 'IIM Indore campus, Rau-Pithampur Road, Indore 453556'),
  ('ATM (near Gate 1)', 'bank', 22.629878, 75.791918, 40, 'IIM Indore campus, Rau-Pithampur Road, Indore 453556')
) as v(name, category, lat, lng, radius_m, address)
where not exists (
  select 1 from public.places p
  where p.city_id = 'indore' and lower(p.name) = lower(v.name)
    and abs(p.lat - v.lat) < 0.0006 and abs(p.lng - v.lng) < 0.0006);

-- The campus itself keeps a wide radius around the main buildings.
update public.places set address = coalesce(address, 'Prabandh Shikhar, Rau-Pithampur Road, Indore 453556')
where city_id = 'indore' and name = 'Indian Institute of Management Indore';
