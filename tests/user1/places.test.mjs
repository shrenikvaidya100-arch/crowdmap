// User 1: adding, confirming, editing and deleting user-added places.
// Every test runs in a transaction that is rolled back.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import pg from "pg";

const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL });
let sarafa;
before(async () => {
  await db.connect();
  sarafa = (await db.query("select id, lat, lng from public.places where name = 'Sarafa Bazaar'")).rows[0];
});
after(() => db.end());

async function inTx(fn) {
  await db.query("begin");
  try { await fn(); } finally { await db.query("rollback"); }
}
/** A user whose account is old enough to add places (unless fresh = true). */
async function newUser(fresh = false) {
  const id = randomUUID();
  await db.query(`insert into auth.users (id, email, aud, role, raw_user_meta_data)
                  values ($1, $2, 'authenticated', 'authenticated', '{"display_name":"Mapper"}')`, [id, `${id}@test.invalid`]);
  if (!fresh) await db.query("update public.profiles set created_at = now() - interval '3 days' where id = $1", [id]);
  return id;
}
async function actAs(id) {
  await db.query("reset role");
  await db.query("set local role authenticated");
  await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: id, role: "authenticated" })]);
}
const asOwner = () => db.query("reset role");
// A spot ~300 m east of Sarafa Bazaar, in Indore.
const spot = () => ({ lat: sarafa.lat, lng: sarafa.lng + 0.003 });
const add = async (name, category = "street_food", at = spot(), acc = 12) =>
  (await db.query("select public.add_place($1, null, $2, $3, $4, $5, 3) as r", [name, category, at.lat, at.lng, acc])).rows[0].r;
const confirm = async (id, exists, at = spot()) =>
  (await db.query("select public.confirm_place($1, $2, $3, $4, 12, 3) as r", [id, exists, at.lat, at.lng])).rows[0].r;
const status = async (id) => (await db.query("select status from public.places where id = $1", [id])).rows[0]?.status;

test("a user at the spot can add a place; it starts unconfirmed in the right city, audited", () => inTx(async () => {
  const u = await newUser();
  await actAs(u);
  const r = await add("Test Kachori Corner");
  assert.deepEqual([r.ok, r.city_id], [true, "indore"], JSON.stringify(r));
  await asOwner();
  const p = (await db.query("select status, category, radius_m, added_by from public.places where id = $1", [r.id])).rows[0];
  assert.deepEqual(p, { status: "unconfirmed", category: "street_food", radius_m: 80, added_by: u });
  const log = await db.query("select action from public.audit_log where actor_id = $1 and action like 'place.%'", [u]);
  assert.deepEqual(log.rows.map((x) => x.action), ["place.add"]);
}));

test("new accounts, bad names, bad categories, weak GPS and places outside cities are refused", () => inTx(async () => {
  const fresh = await newUser(true);
  const u = await newUser();
  await actAs(fresh);
  assert.equal((await add("Test Fresh Shop")).reason, "new_account");
  await actAs(u);
  assert.equal((await add("x")).reason, "bad_name");
  assert.equal((await add("Visit www.spam.example")).reason, "bad_name");
  assert.equal((await add("12345")).reason, "bad_name");
  assert.equal((await add("Test Shop", "casino")).reason, "bad_category");
  assert.equal((await add("Test Shop", "cafe", spot(), 300)).reason, "low_accuracy");
  await asOwner();
  const traveller = await newUser(); // no earlier location, so no "impossible travel"
  await actAs(traveller);
  assert.equal((await add("Test Shop", "cafe", { lat: 25.3176, lng: 82.9739 })).reason, "outside_cities"); // Varanasi
}));

test("duplicates within 50 m are refused and point to the existing place", () => inTx(async () => {
  await actAs(await newUser());
  const r = await add("Sarafa Bazar", "street_food", { lat: sarafa.lat, lng: sarafa.lng });
  assert.deepEqual([r.ok, r.reason, r.place_id], [false, "duplicate", sarafa.id]);
}));

test("three new places a day at most", () => inTx(async () => {
  await actAs(await newUser());
  // Different names, ~80 m apart, so none is a duplicate of another.
  const names = ["Alpha Tea House", "Bravo Book Corner", "Charlie Juice Bar"];
  for (const [i, n] of names.entries()) {
    const at = { lat: spot().lat + i * 0.0007, lng: spot().lng };
    assert.equal((await add(n, "cafe", at)).ok, true, n);
  }
  assert.equal((await add("Test Four Stall")).reason, "daily_limit");
}));

test("two confirmations from people at the spot list it; the adder can't confirm", () => inTx(async () => {
  const [adder, a, b] = [await newUser(), await newUser(), await newUser()];
  await actAs(adder);
  const id = (await add("Test Lassi Point")).id;
  assert.equal((await confirm(id, true)).reason, "own_place");
  await actAs(a);
  assert.equal((await confirm(id, true)).status, "unconfirmed");
  await actAs(b);
  const far = { lat: spot().lat + 0.01, lng: spot().lng };
  assert.equal((await confirm(id, true, far)).reason, "not_at_place");
  await asOwner();
  await db.query("delete from public.location_checks where user_id = $1", [b]); // forget b's far-away fix
  await actAs(b);
  assert.equal((await confirm(id, true)).status, "listed");
  await asOwner();
  assert.equal(await status(id), "listed");
}));

test("two 'doesn't exist' votes remove a fake place", () => inTx(async () => {
  const [adder, a, b] = [await newUser(), await newUser(), await newUser()];
  await actAs(adder);
  const id = (await add("Test Fake Temple", "temple")).id;
  await actAs(a);
  await confirm(id, false);
  await actAs(b);
  assert.equal((await confirm(id, false)).status, "removed");
  await asOwner();
  assert.equal(await status(id), "removed");
}));

test("the adder can edit and delete while unconfirmed; others cannot", () => inTx(async () => {
  const [adder, other] = [await newUser(), await newUser()];
  await actAs(adder);
  const id = (await add("Test Chai Stal", "cafe")).id;
  await actAs(other);
  assert.equal((await db.query("select public.edit_my_place($1, 'Hacked', null, 'cafe') as r", [id])).rows[0].r.reason, "not_editable");
  assert.equal((await db.query("select public.delete_my_place($1) as r", [id])).rows[0].r.reason, "not_editable");
  await actAs(adder);
  assert.equal((await db.query("select public.edit_my_place($1, 'Test Chai Stall', 'चाय स्टॉल', 'cafe') as r", [id])).rows[0].r.ok, true);
  assert.equal((await db.query("select public.delete_my_place($1) as r", [id])).rows[0].r.ok, true);
  await asOwner();
  const p = (await db.query("select name, name_hi, status from public.places where id = $1", [id])).rows[0];
  assert.deepEqual(p, { name: "Test Chai Stall", name_hi: "चाय स्टॉल", status: "removed" });
}));

test("signed-out visitors cannot add or confirm places", () => inTx(async () => {
  await db.query("set local role anon");
  await db.query("savepoint s");
  await assert.rejects(db.query("select public.add_place('X Shop', null, 'cafe', 22.7, 75.8, 10, 0)"), /permission denied/);
  await db.query("rollback to savepoint s");
  await assert.rejects(db.query("select public.confirm_place($1, true, 22.7, 75.8, 10, 0)", [sarafa.id]), /permission denied/);
  await db.query("rollback to savepoint s");
}));
