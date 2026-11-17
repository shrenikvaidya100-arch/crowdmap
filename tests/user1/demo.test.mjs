// User 1: sample (demo) data is always labelled and never feeds real predictions.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import pg from "pg";

const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL });
let place;
before(async () => {
  await db.connect();
  // A place with no recent real reports.
  place = (await db.query(`
    select id, lat, lng, city_id from public.places p
    where city_id = 'mumbai' and status = 'listed' and category = 'park'
      and not exists (select 1 from public.crowd_reports r where r.place_id = p.id and r.created_at > now() - interval '2 hours')
    limit 1`)).rows[0];
});
after(() => db.end());

async function inTx(fn) {
  await db.query("begin");
  try { await fn(); } finally { await db.query("rollback"); }
}
const mapEntry = async () =>
  (await db.query("select public.crowd_map($1) as m", [place.city_id])).rows[0].m.places.find((p) => p.id === place.id);
const details = async () => (await db.query("select public.place_details($1) as d", [place.id])).rows[0].d;

test("a place with only sample reports is live but labelled sample, on the map and in the panel", () => inTx(async () => {
  await db.query("insert into public.crowd_reports (place_id, level, is_sample) values ($1, 4, true), ($1, 4, true)", [place.id]);
  const m = await mapEntry();
  assert.deepEqual([m.source, m.sample], ["live", true]);
  const d = await details();
  assert.deepEqual([d.crowd.source, d.crowd.sample], ["live", true]);
}));

test("one real report removes the sample label", () => inTx(async () => {
  await db.query("insert into public.crowd_reports (place_id, level, is_sample) values ($1, 4, true)", [place.id]);
  const u = randomUUID();
  await db.query(`insert into auth.users (id, email, aud, role, raw_user_meta_data)
                  values ($1, $2, 'authenticated', 'authenticated', '{"display_name":"Real"}')`, [u, `${u}@test.invalid`]);
  await db.query("insert into public.crowd_reports (place_id, user_id, level) values ($1, $2, 2)", [place.id, u]);
  const m = await mapEntry();
  assert.deepEqual([m.source, m.sample], ["live", false]);
}));

test("places without activity stay estimated and unlabelled (fast path)", () => inTx(async () => {
  const m = await mapEntry();
  assert.deepEqual([m.source, m.sample, m.here], ["estimated", false, 0]);
}));

test("sample alerts are labelled", () => inTx(async () => {
  await db.query(`insert into public.quick_reports (kind, place_id, city_id, lat, lng, is_sample, expires_at)
                  values ('long_queue', $1, $2, $3, $4, true, now() + interval '1 hour')`, [place.id, place.city_id, place.lat, place.lng]);
  const d = await details();
  assert.equal(d.alerts[0].sample, true);
}));

test("sample reports never feed the forecast's history", () => inTx(async () => {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  const before = (await db.query("select public.forecast_day($1, $2) as f", [place.id, date])).rows[0].f;
  await db.query(`insert into public.crowd_reports (place_id, level, is_sample, created_at)
                  select $1, 5, true, now() - (g || ' days')::interval from generate_series(7, 49, 7) g`, [place.id]);
  const after = (await db.query("select public.forecast_day($1, $2) as f", [place.id, date])).rows[0].f;
  assert.deepEqual(after.hours.map((h) => h.history_reports), before.hours.map((h) => h.history_reports));
  assert.deepEqual(after.hours.map((h) => h.level), before.hours.map((h) => h.level));
}));
