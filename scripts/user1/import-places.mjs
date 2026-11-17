// Imports named places for each launch city from OpenStreetMap (Overpass API)
// into public.places. Safe to re-run: rows are matched on (osm_type, osm_id).
//
//   node --env-file=.env.local scripts/user1/import-places.mjs            # all cities
//   node --env-file=.env.local scripts/user1/import-places.mjs indore     # one city
import pg from "pg";

const OVERPASS = "https://overpass-api.de/api/interpreter";

// Search radius around each city centre, in metres.
const CITY_RADIUS = { indore: 12000, pondicherry: 8000, vadodara: 10000, chennai: 14000, delhi: 14000 };

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
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(OVERPASS, {
      method: "POST", body,
      headers: { "User-Agent": "CrowdMap-student-project/0.1 (course project; one-off import)" },
    });
    if (res.ok) return (await res.json()).elements;
    console.warn(`  Overpass ${res.status}, retrying in ${attempt * 20}s`);
    await new Promise((r) => setTimeout(r, attempt * 20000));
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
    list.sort((a, b) => b.score - a.score).slice(0, CAP[cat] ?? 50));
}

async function main() {
  const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL });
  await db.connect();
  const only = process.argv[2];
  const { rows: cities } = await db.query(
    "select id, lat, lng from public.cities where $1::text is null or id = $1 order by sort_order", [only ?? null]);

  for (const city of cities) {
    console.log(`${city.id}: querying OpenStreetMap…`);
    const places = toPlaces(await fetchCity(city), city.id);
    let added = 0;
    for (const p of places) {
      const r = await db.query(
        `insert into public.places (osm_type, osm_id, city_id, name, name_hi, category, lat, lng, radius_m, address)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         on conflict (osm_type, osm_id) do update set
           name = excluded.name, name_hi = excluded.name_hi, category = excluded.category,
           lat = excluded.lat, lng = excluded.lng, address = excluded.address
         returning (xmax = 0) as inserted`,
        [p.osm_type, p.osm_id, p.city_id, p.name, p.name_hi, p.category, p.lat, p.lng, p.radius_m, p.address]);
      if (r.rows[0].inserted) added++;
    }
    const counts = places.reduce((m, p) => ({ ...m, [p.category]: (m[p.category] ?? 0) + 1 }), {});
    console.log(`  ${places.length} places (${added} new):`, counts);
    // Be polite to the free Overpass server between cities.
    await new Promise((r) => setTimeout(r, 5000));
  }
  await db.query(
    "select public.log_event_as(null, 'system', 'system.places_import', 'city', $1, $2)",
    [only ?? "all", { source: "openstreetmap" }]);
  await db.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
