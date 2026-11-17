// User 1: live presence (heartbeats, counts, privacy) and its effect on levels.
// Every test runs in a transaction that is rolled back.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import pg from "pg";

const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL });
let temple, cafe, delhi;
before(async () => {
  await db.connect();
  const one = async (sql) => (await db.query(sql)).rows[0];
  temple = await one("select id, lat, lng from public.places where city_id = 'indore' and category = 'temple' and status = 'listed' order by name limit 1");
  cafe = await one("select id, lat, lng from public.places where city_id = 'indore' and category = 'cafe' and status = 'listed' order by name limit 1");
  delhi = await one("select id, lat, lng from public.places where city_id = 'delhi' limit 1");
});
after(() => db.end());

async function inTx(fn) {
  await db.query("begin");
  try { await fn(); } finally { await db.query("rollback"); }
}
async function newUser() {
  await db.query("reset role"); // only the owner can create test users
  const id = randomUUID();
  await db.query(`insert into auth.users (id, email, aud, role, raw_user_meta_data)
                  values ($1, $2, 'authenticated', 'authenticated', '{"display_name":"Walker"}')`, [id, `${id}@test.invalid`]);
  return id;
}
async function actAs(id) {
  await db.query("reset role");
  await db.query("set local role authenticated");
  await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: id, role: "authenticated" })]);
}
const asOwner = () => db.query("reset role");
const beat = async (p, acc = 15) => (await db.query("select public.heartbeat($1, $2, $3) as r", [p.lat, p.lng, acc])).rows[0].r;
const live = async (id) => (await db.query("select * from public.live_level($1)", [id])).rows[0];

test("a heartbeat at a place counts the user there, and shows on the map", () => inTx(async () => {
  await actAs(await newUser());
  const r = await beat(temple);
  assert.deepEqual([r.ok, r.place_id, r.here], [true, temple.id, 1], JSON.stringify(r));
  await asOwner();
  const m = (await db.query("select public.crowd_map('indore') as m")).rows[0].m;
  assert.equal(m.places.find((p) => p.id === temple.id).here, 1);
  const d = (await db.query("select public.place_details($1) as d", [temple.id])).rows[0].d;
  assert.equal(d.crowd.here, 1);
}));

test("weak GPS is refused and repeat heartbeats within 30 s are ignored", () => inTx(async () => {
  await actAs(await newUser());
  assert.equal((await beat(temple, 500)).reason, "low_accuracy");
  assert.equal((await beat(temple)).ok, true);
  assert.equal((await beat(cafe)).throttled, true);
}));

test("teleporting between cities is refused and recorded for bot detection", () => inTx(async () => {
  const u = await newUser();
  await actAs(u);
  await beat(temple);
  await asOwner();
  await db.query("update public.presence set updated_at = now() - interval '2 minutes' where user_id = $1", [u]);
  await actAs(u);
  assert.equal((await beat(delhi)).reason, "impossible_travel");
  await asOwner();
  const chk = await db.query("select source, accepted, reason from public.location_checks where user_id = $1", [u]);
  assert.deepEqual(chk.rows, [{ source: "presence", accepted: false, reason: "impossible_travel" }]);
}));

test("many people at once raise the level; a few never lower it", () => inTx(async () => {
  assert.equal(await live(temple.id), undefined, "no reports, no presence: not live");
  for (let i = 0; i < 4; i++) { await actAs(await newUser()); await beat(temple); }
  await asOwner();
  assert.equal(await live(temple.id), undefined, "4 people at a temple prove nothing");
  await actAs(await newUser());
  await beat(temple);
  await asOwner();
  const l = await live(temple.id);
  assert.equal(l.here, 5);
  assert.ok(l.level >= 3, `5 people at a temple: at least moderate, got ${l.level}`);
}));

test("presence floors a low report-based level but doesn't cap a high one", () => inTx(async () => {
  for (let i = 0; i < 3; i++) { await actAs(await newUser()); await beat(cafe); }
  await actAs(await newUser());
  await db.query("select public.submit_crowd_report($1, 1, $2, $3, 15, 3)", [cafe.id, cafe.lat, cafe.lng]);
  await asOwner();
  assert.ok((await live(cafe.id)).level >= 3, "report says empty, but 3 people at a café: at least moderate");
}));

test("old heartbeats stop counting after 10 minutes; stopping forgets you", () => inTx(async () => {
  const [a, b] = [await newUser(), await newUser()];
  await actAs(a);
  await beat(temple);
  await actAs(b);
  await beat(temple);
  await asOwner();
  await db.query("update public.presence set updated_at = now() - interval '11 minutes' where user_id = $1", [a]);
  assert.equal((await db.query("select public.here_now($1) as n", [temple.id])).rows[0].n, 1);
  await actAs(b);
  await db.query("select public.stop_presence()");
  await asOwner();
  assert.equal((await db.query("select count(*)::int as n from public.presence where user_id = $1", [b])).rows[0].n, 0);
}));

test("positions are private: others and visitors cannot read them; hourly counts are public", () => inTx(async () => {
  const [a, b] = [await newUser(), await newUser()];
  await actAs(a);
  await beat(temple);
  assert.equal((await db.query("select * from public.presence")).rowCount, 1, "you see your own row");
  await actAs(b);
  assert.equal((await db.query("select * from public.presence")).rowCount, 0, "not someone else's");
  await asOwner();
  await db.query("set local role anon");
  await db.query("savepoint s");
  await assert.rejects(db.query("select * from public.presence"), /permission denied/);
  await db.query("rollback to savepoint s");
  const h = await db.query("select peak from public.presence_hourly where place_id = $1", [temple.id]);
  assert.equal(h.rows[0].peak, 1);
}));
