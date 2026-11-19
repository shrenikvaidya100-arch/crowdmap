// Sample live data for demos. Every row is flagged is_sample = true, shown with
// a "Sample" label in the app, excluded from forecast history, and removable.
//
//   node --env-file=.env.local scripts/user1/demo-data.mjs indore        # refresh Indore
//   node --env-file=.env.local scripts/user1/demo-data.mjs all           # all cities
//   node --env-file=.env.local scripts/user1/demo-data.mjs --clear       # remove all sample data
//   node --env-file=.env.local scripts/user1/demo-data.mjs --place "D-303 Classroom" 4   # one place to a level (backup for a live demo)
//
// Sample reports count as "live" for 90 minutes, so run it shortly before a demo.
import pg from "pg";

// Popular kinds of places get sample reports; ~share of them per city.
const CATEGORIES = ["temple", "street_food", "market", "mall", "tourist", "park", "restaurant", "cafe", "station"];
const SHARE = 0.12;
const ALERTS = ["long_queue", "parking_full", "police", "festival_rush", "procession"];

const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL });
await db.connect();

async function clear(city) {
  const where = city ? "and place_id in (select id from public.places where city_id = $1)" : "";
  const args = city ? [city] : [];
  const r = await db.query(`delete from public.crowd_reports where is_sample ${where}`, args);
  const q = await db.query(`delete from public.quick_reports where is_sample ${city ? "and city_id = $1" : ""}`, args);
  return r.rowCount + q.rowCount;
}

async function seed(city) {
  const { rows: [{ n }] } = await db.query(
    "select count(*)::int as n from public.places where city_id = $1 and status = 'listed' and category = any($2)", [city, CATEGORIES]);
  const limit = Math.max(10, Math.round(n * SHARE));

  // 2-4 reports per picked place, near its typical level for now (±1), from the last 5-60 minutes.
  const reports = await db.query(`
    with picked as (
      select id, public.estimated_level(id, category) as e from public.places
      where city_id = $1 and status = 'listed' and category = any($2)
      order by random() limit $3
    )
    insert into public.crowd_reports (place_id, level, is_sample, created_at)
    select p.id, greatest(1, least(5, round(p.e + (random() * 2 - 1))))::smallint, true,
           now() - (5 + random() * 55) * interval '1 minute'
    from picked p cross join lateral generate_series(1, 2 + floor(random() * 3)::int)
    returning place_id`, [city, CATEGORIES, limit]);

  // IIM Indore campus: about half its places get sample readings too, so the demo
  // campus is lively (messes and cafés busier at meal times, by their usual pattern).
  let campus = { rows: [], rowCount: 0 };
  if (city === "indore") {
    campus = await db.query(`
      with picked as (
        select id, public.estimated_level(id, category) as e from public.places
        where city_id = 'indore' and status = 'listed' and address like '%IIM Indore campus%'
          and not exists (select 1 from public.crowd_reports r where r.place_id = places.id and r.is_sample)
        order by random() limit 55
      )
      insert into public.crowd_reports (place_id, level, is_sample, created_at)
      select p.id, greatest(1, least(5, round(p.e + (random() * 2 - 1))))::smallint, true,
             now() - (5 + random() * 55) * interval '1 minute'
      from picked p cross join lateral generate_series(1, 2 + floor(random() * 2)::int)
      returning place_id`);
  }

  // A few one-tap alerts at the busiest sample places.
  const alerts = await db.query(`
    with busy as (
      select r.place_id, avg(r.level) as lvl from public.crowd_reports r
      join public.places p on p.id = r.place_id
      where r.is_sample and p.city_id = $1 and r.created_at > now() - interval '90 minutes'
      group by 1 order by 2 desc limit 5
    )
    insert into public.quick_reports (kind, place_id, city_id, lat, lng, is_sample, still_there, expires_at)
    select k.kind, b.place_id, $1, p.lat, p.lng, true, floor(random() * 4)::int,
           now() + make_interval(mins => k.ttl_minutes)
    from (select place_id, row_number() over () as i from busy) b
    join public.places p on p.id = b.place_id
    join public.quick_report_kinds k on k.kind = ($2::text[])[1 + (b.i - 1) % array_length($2::text[], 1)]
    returning id`, [city, ALERTS]);

  const placeIds = new Set([...reports.rows, ...campus.rows].map((r) => r.place_id));
  return { places: placeIds.size, reports: reports.rowCount + campus.rowCount, campus: new Set(campus.rows.map((r) => r.place_id)).size, alerts: alerts.rowCount };
}

try {
  const arg = process.argv[2] ?? "indore";
  if (arg === "--place") {
    const name = process.argv[3];
    const level = Math.min(5, Math.max(1, Number(process.argv[4] ?? 4)));
    const { rows: [p] } = await db.query("select id, city_id from public.places where name = $1 and status <> 'removed' limit 1", [name]);
    if (!p) throw new Error(`no place called ${name}`);
    await db.query("delete from public.crowd_reports where is_sample and place_id = $1", [p.id]);
    await db.query(`insert into public.crowd_reports (place_id, level, is_sample, created_at)
                    select $1, $2, true, now() - (g * interval '2 minutes') from generate_series(1, 3) g`, [p.id, level]);
    await db.query("select public.notify_city($1, $2, 'report')", [p.city_id, p.id]).catch(() => {});
    console.log(`${name}: 3 sample reports at level ${level} (live for 90 minutes)`);
  } else if (arg === "--clear") {
    console.log(`removed ${await clear(null)} sample rows`);
    await db.query("select public.log_event_as(null, 'system', 'system.demo_data_clear', null, null, '{}')");
  } else {
    const cities = arg === "all"
      ? (await db.query("select id from public.cities order by sort_order")).rows.map((r) => r.id)
      : [arg];
    for (const city of cities) {
      const removed = await clear(city);
      const s = await seed(city);
      console.log(`${city}: removed ${removed} old sample rows; added ${s.reports} sample reports at ${s.places} places${s.campus ? ` (${s.campus} on the IIM campus)` : ""} and ${s.alerts} alerts`);
      await db.query("select public.log_event_as(null, 'system', 'system.demo_data', 'city', $1, $2)", [city, s]);
    }
  }
} finally {
  await db.end();
}
