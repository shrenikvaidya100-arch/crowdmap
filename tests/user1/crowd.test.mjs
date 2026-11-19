// User 1: crowd reports, GPS checks, quick reports and crowd levels.
// Every test runs in a transaction that is rolled back.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import pg from "pg";

const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL });
let indore, delhi; // a real place in each city
before(async () => {
  await db.connect();
  indore = (await db.query("select id, lat, lng from public.places where city_id = 'indore' and category = 'temple' limit 1")).rows[0];
  delhi = (await db.query("select id, lat, lng from public.places where city_id = 'delhi' limit 1")).rows[0];
});
after(() => db.end());

async function inTx(fn) {
  await db.query("begin");
  try { await fn(); } finally { await db.query("rollback"); }
}
async function newUser() {
  const id = randomUUID();
  await db.query(`insert into auth.users (id, email, aud, role, raw_user_meta_data)
                  values ($1, $2, 'authenticated', 'authenticated', '{"display_name":"Tester"}')`, [id, `${id}@test.invalid`]);
  return id;
}
async function actAs(id) {
  await db.query("reset role");
  await db.query("set local role authenticated");
  await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: id, role: "authenticated" })]);
}
const asOwner = () => db.query("reset role");
const report = async (place, level, lat, lng, acc = 15, spread = 5) =>
  (await db.query("select public.submit_crowd_report($1, $2, $3, $4, $5, $6) as r", [place, level, lat, lng, acc, spread])).rows[0].r;
// ~1.1 km north of a point
const away = (p) => [p.lat + 0.01, p.lng];

test("places were imported for every city", async () => {
  const { rows } = await db.query("select city_id, count(*)::int as n from public.places group by 1");
  const counts = Object.fromEntries(rows.map((r) => [r.city_id, r.n]));
  for (const c of ["indore", "delhi", "mumbai"]) assert.ok(counts[c] > 50, `${c}: ${counts[c]}`);
});

test("crowd_map gives every place a 1-5 level, even without reports", () => inTx(async () => {
  await db.query("set local role anon");
  const { rows } = await db.query("select public.crowd_map('indore') as m");
  const places = rows[0].m.places;
  assert.ok(places.length > 500, "more than 1000-row API limit is not an issue: one JSON value");
  assert.ok(places.every((p) => p.level >= 1 && p.level <= 5));
  await asOwner();
}));

test("a report from someone at the place goes live and is audited", () => inTx(async () => {
  const u = await newUser();
  await actAs(u);
  const r = await report(indore.id, 5, indore.lat, indore.lng);
  assert.equal(r.ok, true, JSON.stringify(r));
  await asOwner();
  const live = (await db.query("select * from public.live_level($1)", [indore.id])).rows[0];
  assert.equal(Math.round(live.level), 5);
  const log = await db.query("select action from public.audit_log where actor_id = $1 order by id", [u]);
  assert.deepEqual(log.rows.map((x) => x.action), ["auth.signup", "crowd.report"]);
}));

test("reports from someone not at the place are rejected but still recorded", () => inTx(async () => {
  const u = await newUser();
  await actAs(u);
  const [lat, lng] = away(indore);
  const r = await report(indore.id, 3, lat, lng);
  assert.deepEqual([r.ok, r.reason], [false, "not_at_place"]);
  await asOwner();
  const chk = await db.query("select accepted, reason from public.location_checks where user_id = $1", [u]);
  assert.deepEqual(chk.rows, [{ accepted: false, reason: "not_at_place" }]);
  const n = await db.query("select count(*)::int as n from public.crowd_reports where user_id = $1", [u]);
  assert.equal(n.rows[0].n, 0);
  const log = await db.query("select action from public.audit_log where actor_id = $1 and action like 'crowd.%'", [u]);
  assert.deepEqual(log.rows.map((x) => x.action), ["crowd.report_rejected"]);
}));

test("weak GPS, jumping GPS and repeat reports are refused", () => inTx(async () => {
  const u = await newUser();
  await actAs(u);
  assert.equal((await report(indore.id, 3, indore.lat, indore.lng, 300)).reason, "low_accuracy");
  assert.equal((await report(indore.id, 3, indore.lat, indore.lng, 15, 400)).reason, "unstable_location");
  assert.equal((await report(indore.id, 3, indore.lat, indore.lng)).ok, true);
  assert.equal((await report(indore.id, 4, indore.lat, indore.lng)).reason, "too_soon");
  await asOwner();
}));

test("impossible travel between cities is caught", () => inTx(async () => {
  const u = await newUser();
  await actAs(u);
  assert.equal((await report(indore.id, 3, indore.lat, indore.lng)).ok, true);
  const r = await report(delhi.id, 3, delhi.lat, delhi.lng);
  assert.deepEqual([r.ok, r.reason], [false, "impossible_travel"]);
  await asOwner();
}));

test("owners can change and delete their report; others cannot", () => inTx(async () => {
  const a = await newUser();
  const b = await newUser();
  await actAs(a);
  const id = (await report(indore.id, 2, indore.lat, indore.lng)).id;
  await actAs(b);
  assert.equal((await db.query("update public.crowd_reports set level = 5 where id = $1", [id])).rowCount, 0);
  assert.equal((await db.query("delete from public.crowd_reports where id = $1", [id])).rowCount, 0);
  await actAs(a);
  assert.equal((await db.query("update public.crowd_reports set level = 4 where id = $1", [id])).rowCount, 1);
  assert.equal((await db.query("delete from public.crowd_reports where id = $1", [id])).rowCount, 1);
  await asOwner();
  const log = await db.query("select action from public.audit_log where actor_id = $1 and action like 'crowd.%' order by id", [a]);
  assert.deepEqual(log.rows.map((x) => x.action), ["crowd.report", "crowd.report_update", "crowd.report_delete"]);
}));

test("quick reports merge duplicates, and two 'gone' votes end them", () => inTx(async () => {
  const [a, b, c, d] = [await newUser(), await newUser(), await newUser(), await newUser()];
  const quick = async (kind) => (await db.query(
    "select public.submit_quick_report($1, $2, $3, $4, 15, 5) as r", [kind, indore.id, indore.lat, indore.lng])).rows[0].r;
  const vote = async (id, still) => (await db.query(
    "select public.vote_quick_report($1, $2, $3, $4, 15, 5) as r", [id, still, indore.lat, indore.lng])).rows[0].r;

  await actAs(a);
  const first = await quick("long_queue");
  assert.equal(first.ok, true);
  await actAs(b);
  const second = await quick("long_queue");
  assert.deepEqual([second.ok, second.merged, second.id], [true, true, first.id]);
  await actAs(c);
  assert.equal((await vote(first.id, false)).ok, true);
  await actAs(d);
  assert.equal((await vote(first.id, false)).ok, true);
  await asOwner();
  // b's merge counts as one "still there", c and d say gone: 2 > 1, so it ends.
  const q = (await db.query("select still_there, gone, expires_at <= now() as ended from public.quick_reports where id = $1", [first.id])).rows[0];
  assert.deepEqual(q, { still_there: 1, gone: 2, ended: true });
}));

test("signed-out visitors can read the map but not report", () => inTx(async () => {
  await db.query("set local role anon");
  await db.query("savepoint s");
  await assert.rejects(db.query("select public.submit_crowd_report($1, 3, 0, 0, 10, 0)", [indore.id]), /permission denied/);
  await db.query("rollback to savepoint s");
  await assert.rejects(db.query("select * from public.location_checks"), /permission denied/);
  await db.query("rollback to savepoint s");
  await asOwner();
}));

test("alert authors are private: others can see the alert, not who posted it", () => inTx(async () => {
  const [author, other] = [await newUser(), await newUser()];
  await db.query(`insert into public.quick_reports (user_id, kind, place_id, city_id, lat, lng, expires_at)
                  values ($1, 'police', $2, 'indore', $3, $4, now() + interval '1 hour')`, [author, indore.id, indore.lat, indore.lng]);
  await actAs(other);
  assert.equal((await db.query("select id from public.quick_reports where place_id = $1", [indore.id])).rowCount, 1);
  await db.query("savepoint s");
  await assert.rejects(db.query("select user_id from public.quick_reports"), /permission denied/);
  await db.query("rollback to savepoint s");
  assert.equal((await db.query("select * from public.my_quick_reports()")).rowCount, 0);
  await actAs(author);
  assert.equal((await db.query("select * from public.my_quick_reports()")).rowCount, 1);
  await asOwner();
}));

test("crowd_overview gives every city one bubble (anyone can read it)", () => inTx(async () => {
  await db.query("set local role anon");
  const list = (await db.query("select public.crowd_overview() as o")).rows[0].o;
  await asOwner();
  const cities = (await db.query("select count(*)::int as n from public.cities")).rows[0].n;
  assert.equal(list.length, cities);
  const indoreRow = list.find((c) => c.id === "indore");
  assert.ok(indoreRow.places > 50 && indoreRow.level >= 1 && indoreRow.level <= 5, JSON.stringify(indoreRow));
  for (const c of list) assert.ok(c.places === 0 ? c.level === null : c.level >= 1 && c.level <= 5, c.id);
}));

test("community: city_media and city_posts are public and hide user ids", () => inTx(async () => {
  const u = await newUser();
  await db.query("insert into public.quick_reports (user_id, kind, place_id, city_id, lat, lng, expires_at) values ($1, 'long_queue', $2, 'indore', $3, $4, now() + interval '1 hour')",
    [u, indore.id, indore.lat, indore.lng]);
  await db.query("set local role anon");
  const posts = (await db.query("select public.city_posts('indore', 20) as p")).rows[0].p;
  const media = (await db.query("select * from public.city_media('indore', 24)")).rows;
  await asOwner();
  const mine = posts.find((p) => p.type === "alert" && p.place_id === indore.id && p.kind === "long_queue");
  assert.ok(mine, "the new alert is in the feed");
  assert.ok(!JSON.stringify(posts).includes(u), "no user id in posts");
  assert.ok(media.every((m) => !("user_id" in m)));
  assert.equal((await db.query("select public.city_posts('delhi', 20) as p")).rows[0].p.some((p) => p.id === mine.id), false);
}));

test("IIM Indore campus is mapped in detail (hostels, messes, blocks) with crowd levels", () => inTx(async () => {
  await db.query("set local role anon");
  const m = (await db.query("select public.crowd_map('indore') as m")).rows[0].m;
  await asOwner();
  const campus = m.places.filter((p) => p.lat > 22.622 && p.lat < 22.632 && p.lng > 75.785 && p.lng < 75.797);
  assert.ok(campus.length >= 100, `campus places: ${campus.length}`);
  for (const n of ["SR 01", "Mess 1", "Learning Centre (Library)", "Main Gate (Gate No. 1)", "Juicilicious Cafe"]) {
    assert.ok(campus.some((p) => p.name === n), n);
  }
  const hostels = campus.filter((p) => p.category === "hostel");
  assert.ok(hostels.length >= 25 && hostels.every((p) => p.level >= 1 && p.level <= 5));
}));
