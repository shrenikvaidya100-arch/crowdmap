// Imports named places for each launch city from OpenStreetMap (Overpass API)
// into public.places. Safe to re-run: rows are matched on (osm_type, osm_id).
//
//   node --env-file=.env.local scripts/user1/import-places.mjs            # all cities
//   node --env-file=.env.local scripts/user1/import-places.mjs indore     # one city
//   node --env-file=.env.local scripts/user1/import-places.mjs --missing  # cities with no places yet
import pg from "pg";

const OVERPASS = "https://overpass-api.de/api/interpreter";

// Search radius around each city centre, in metres.
// Mumbai is long north-south: 20 km reaches Colaba (Gateway of India) from the centre.
const CITY_RADIUS = {
  indore: 12000, delhi: 14000, mumbai: 20000, bengaluru: 15000, hyderabad: 15000, chennai: 15000, kolkata: 14000,
  pune: 12000, ahmedabad: 12000,
  // Small hill and north-east capitals: the town itself.
  leh: 7000, gangtok: 7000, kohima: 7000, aizawl: 7000, itanagar: 7000, shimla: 7000, shillong: 8000, "port-blair": 8000,
};

// Most places per category per city, keeping the best-documented ones.
const CAP = {
  temple: 250, religious: 120, market: 120, restaurant: 250, cafe: 120, street_food: 150,
  mall: 60, park: 150, tourist: 120, hospital: 120, station: 60, bank: 80,
  government: 60, education: 100, entertainment: 80,
};

// Default "you are here" radius per category, in metres.
const RADIUS = {
  temple: 100, religious: 100, market: 200, restaurant: 60, cafe: 50, street_food: 80,
  mall: 150, park: 250, tourist: 200, hospital: 150, station: 250, bank: 50,
  government: 100, education: 250, entertainment: 120,
};

function categorise(t) {
  if (t.amenity === "place_of_worship") return ["hindu", "jain"].includes(t.religion) ? "temple" : "religious";
  if (t.amenity === "marketplace") return "market";
  if (t.amenity === "restaurant") return "restaurant";
  if (t.amenity === "cafe") return "cafe";
  if (t.amenity === "fast_food" || t.amenity === "food_court") return "street_food";
  if (t.shop === "mall") return "mall";
  if (t.leisure === "park") return "park";
  if (t.tourism || t.historic) return "tourist";
  if (t.amenity === "hospital") return "hospital";
  if (t.railway === "station" || t.amenity === "bus_station") return "station";
  if (t.amenity === "bank") return "bank";
  if (t.amenity === "townhall" || t.amenity === "courthouse") return "government";
  if (t.amenity === "university" || t.amenity === "college") return "education";
  if (t.amenity === "cinema" || t.amenity === "theatre" || t.leisure === "stadium") return "entertainment";
  return null;
}

function query(lat, lng, r) {
  const a = `(around:${r},${lat},${lng})`;
  return `[out:json][timeout:180];
(
  nwr["amenity"~"^(place_of_worship|marketplace|restaurant|cafe|fast_food|food_court|hospital|bank|bus_station|townhall|courthouse|university|college|cinema|theatre)$"]["name"]${a};
  nwr["shop"="mall"]["name"]${a};
  nwr["leisure"~"^(park|stadium)$"]["name"]${a};
  nwr["tourism"~"^(attraction|museum|zoo|theme_park)$"]["name"]${a};
  nwr["historic"~"^(monument|fort|palace|memorial)$"]["name"]${a};
  nwr["railway"="station"]["name"]${a};
);
out center tags;`;
}

async function fetchCity(city) {
  const body = new URLSearchParams({ data: query(city.lat, city.lng, CITY_RADIUS[city.id] ?? 10000) });
  for (let attempt = 1; attempt <= 5; attempt++) {
    // The free server sometimes hangs or answers 502/429 when busy: give up on a try after 4 minutes.
    const res = await fetch(OVERPASS, {
      method: "POST", body, signal: AbortSignal.timeout(240000),
      headers: { "User-Agent": "CrowdMap-student-project/0.1 (course project; one-off import)" },
    }).catch((err) => ({ ok: false, status: err.name }));
    if (res.ok) return (await res.json()).elements;
    console.warn(`  Overpass ${res.status}, trying again in ${attempt * 30}s`);
    await new Promise((r) => setTimeout(r, attempt * 30000));
  }
  throw new Error(`Overpass failed for ${city.id}`);
}

function toPlaces(elements, cityId) {
  const byCat = {};
  for (const e of elements) {
    const t = e.tags ?? {};
    const name = (t["name:en"] || t.name || "").trim();
    const lat = e.lat ?? e.center?.lat;
    const lng = e.lon ?? e.center?.lon;
    const category = categorise(t);
    if (!category || name.length < 2 || name.length > 120 || lat == null || lng == null) continue;
    (byCat[category] ??= []).push({
      osm_type: e.type, osm_id: e.id, city_id: cityId, name,
      name_hi: t["name:hi"]?.trim() || null, category, lat, lng,
      radius_m: RADIUS[category],
      address: [t["addr:street"], t["addr:suburb"] || t["addr:city"]].filter(Boolean).join(", ") || null,
      // Better-documented places first (more tags, a Wikidata link).
      score: Object.keys(t).length + (t.wikidata ? 20 : 0),
    });
  }
  return Object.entries(byCat).flatMap(([cat, list]) =>
    dedupe(list.sort((a, b) => b.score - a.score)).slice(0, CAP[cat] ?? 50));
}

// Spam that sometimes gets into OpenStreetMap names (ads, links, keyword lists).
const JUNK = /[|]|https?:|www\.|\bmassage\b|\bspa in\b|call girl|escort/i;

const metres = (a, b) => {
  const toRad = (d) => (d * Math.PI) / 180;
  const x = toRad(b.lng - a.lng) * Math.cos(toRad((a.lat + b.lat) / 2));
  return Math.hypot(x, toRad(b.lat - a.lat)) * 6371000;
};

/** Drops junk names and the same place mapped twice (same name within 200 m). Best-scored copy wins. */
function dedupe(list) {
  const kept = [];
  for (const p of list) {
    if (JUNK.test(p.name)) continue;
    const key = p.name.toLowerCase().replace(/[^a-z0-9ऀ-ॿ]/g, "");
    if (kept.some((k) => k.key === key && metres(k, p) < 200)) continue;
    kept.push({ ...p, key });
  }
  return kept.map(({ key: _key, ...p }) => p);
}

// A fresh connection for each step: the Overpass retries can wait minutes, and an
// idle connection held that long gets dropped by the database (ECONNRESET).
async function withDb(fn) {
  const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL });
  db.on("error", (e) => console.warn(`  database connection: ${e.message}`));
  await db.connect();
  try { return await fn(db); } finally { await db.end().catch(() => {}); }
}

async function main() {
  const only = process.argv[2];
  const { rows: cities } = await withDb((db) => db.query(
    `select c.id, c.lat, c.lng from public.cities c
     where ($1::text is null or c.id = $1)
       and (not $2 or not exists (select 1 from public.places p where p.city_id = c.id))
     order by c.sort_order`, [only === "--missing" ? null : only ?? null, only === "--missing"]));

  for (const city of cities) {
    console.log(`${city.id}: querying OpenStreetMap…`);
    let elements;
    try {
      elements = await fetchCity(city);
    } catch (err) {
      // Skip it; running with --missing again picks it up.
      console.warn(`  skipped: ${err.message}`);
      continue;
    }
    const places = toPlaces(elements, city.id);
    // One round trip for the whole city (the database is far away; per-row inserts are slow).
    const rows = places.map(({ score: _score, ...p }) => p);
    const r = await withDb((db) => db.query(
      `insert into public.places (osm_type, osm_id, city_id, name, name_hi, category, lat, lng, radius_m, address)
       select osm_type, osm_id, city_id, name, name_hi, category, lat, lng, radius_m, address
       from jsonb_to_recordset($1::jsonb) as x(osm_type text, osm_id bigint, city_id text, name text, name_hi text,
                                               category text, lat double precision, lng double precision,
                                               radius_m int, address text)
       on conflict (osm_type, osm_id) do update set
         name = excluded.name, name_hi = excluded.name_hi, category = excluded.category,
         lat = excluded.lat, lng = excluded.lng, address = excluded.address
       returning (xmax = 0) as inserted`,
      [JSON.stringify(rows)]));
    const added = r.rows.filter((x) => x.inserted).length;
    const counts = places.reduce((m, p) => ({ ...m, [p.category]: (m[p.category] ?? 0) + 1 }), {});
    console.log(`  ${places.length} places (${added} new):`, counts);
    // Be polite to the free Overpass server between cities.
    await new Promise((r) => setTimeout(r, 5000));
  }
  await withDb((db) => db.query(
    "select public.log_event_as(null, 'system', 'system.places_import', 'city', $1, $2)",
    [only ?? "all", { source: "openstreetmap" }]));
}

main().catch((err) => { console.error(err); process.exit(1); });
