// Saved places and "tell me when it's quiet" alerts. Every test is rolled back
// (including any push request the database queues).
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import pg from "pg";

const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL });
let places;
before(async () => {
  await db.connect();
  places = (await db.query("select id from public.places where city_id = 'indore' and status = 'listed' and not is_sample order by name limit 12")).rows.map((r) => r.id);
});
after(() => db.end());

async function inTx(fn) {
  await db.query("begin");
  try { await fn(); } finally { await db.query("rollback"); }
}
const asOwner = () => db.query("reset role");
async function newUser(name = "Member") {
  await asOwner();
  const id = randomUUID();
  await db.query(`insert into auth.users (id, email, aud, role, raw_user_meta_data)
                  values ($1, $2, 'authenticated', 'authenticated', $3)`, [id, `${id}@test.invalid`, { display_name: name }]);
  return id;
}
async function actAs(id) {
  await asOwner();
  await db.query("set local role authenticated");
  await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: id, role: "authenticated" })]);
}
async function refused(run, pattern) {
  await db.query("savepoint s");
  await assert.rejects(run(), pattern);
  await db.query("rollback to savepoint s");
}
/** Makes a place's live level `level` (fresh sample reports, nothing else counts). */
async function setLevel(place, level) {
  await asOwner();
  await db.query("delete from public.crowd_reports where place_id = $1", [place]);
  for (let i = 0; i < 3; i++) {
    await db.query("insert into public.crowd_reports (place_id, level, is_sample) values ($1, $2, true)", [place, level]);
  }
}
const one = async (sql, args) => (await db.query(sql, args)).rows[0];

test("save and unsave a place; saved list shows its current level; audited", () => inTx(async () => {
  const u = await newUser();
  await setLevel(places[0], 4);
  await actAs(u);
  assert.deepEqual((await one("select public.toggle_saved_place($1) r", [places[0]])).r, { ok: true, saved: true });
  const list = (await db.query("select * from public.my_saved_places()")).rows;
  assert.deepEqual([list.length, list[0].place_id, list[0].level, list[0].source], [1, places[0], 4, "live"]);
  assert.equal((await one("select public.my_place_state($1) s", [places[0]])).s.saved, true);
  assert.deepEqual((await one("select public.toggle_saved_place($1) r", [places[0]])).r, { ok: true, saved: false });
  await asOwner();
  const log = await db.query("select action from public.audit_log where actor_id = $1 and action like 'place.%save' order by id", [u]);
  assert.deepEqual(log.rows.map((r) => r.action), ["place.save", "place.unsave"]);
}));

test("a watch fires once the place is quiet, with an inbox entry; expired watches say so", () => inTx(async () => {
  const u = await newUser();
  await setLevel(places[1], 5);
  await setLevel(places[2], 5);
  await actAs(u);
  const w = (await one("select public.watch_place($1, 3) r", [places[1]])).r;
  assert.equal(w.ok, true, JSON.stringify(w));
  const w2 = (await one("select public.watch_place($1, 1) r", [places[2]])).r;
  assert.equal(w2.ok, true);

  await asOwner();
  assert.deepEqual((await one("select public.check_watches() r")).r, { fired: 0, expired: 0 });
  await setLevel(places[1], 1);
  await db.query("update public.place_watches set expires_at = now() - interval '1 minute' where id = $1", [w2.id]);
  assert.deepEqual((await one("select public.check_watches() r")).r, { fired: 1, expired: 1 });
  assert.deepEqual((await one("select public.check_watches() r")).r, { fired: 0, expired: 0 }, "one-shot");

  await actAs(u);
  const notes = (await db.query("select kind, place_id, data, push_status from public.notifications order by kind")).rows;
  assert.deepEqual(notes.map((n) => [n.kind, n.place_id, n.push_status]),
    [["place_quiet", places[1], "none"], ["watch_expired", places[2], "none"]]);
  assert.deepEqual([notes[0].data.level, notes[0].data.source], [1, "live"]);
  assert.equal((await one("select public.mark_notifications_read() n")).n, 2);
  const state = (await one("select status, fired_level from public.place_watches where id = $1", [w.id]));
  assert.deepEqual(state, { status: "fired", fired_level: 1 });
}));

test("watch rules: not when already quiet, one per place, at most 10, cancel works", () => inTx(async () => {
  const u = await newUser();
  await setLevel(places[0], 1);
  for (const p of places.slice(1, 12)) await setLevel(p, 5);
  await actAs(u);
  const q = (await one("select public.watch_place($1, 3) r", [places[0]])).r;
  assert.deepEqual([q.ok, q.reason, q.level], [false, "already_quiet", 1]);
  const a = (await one("select public.watch_place($1, 3) r", [places[1]])).r;
  const b = (await one("select public.watch_place($1, 6) r", [places[1]])).r;
  assert.ok(a.ok && b.ok);
  assert.equal((await one("select count(*)::int n from public.place_watches where status = 'active'")).n, 1, "replaced, not doubled");
  for (const p of places.slice(2, 11)) assert.equal((await one("select public.watch_place($1, 1) r", [p])).r.ok, true);
  assert.equal((await one("select public.watch_place($1, 1) r", [places[11]])).r.reason, "too_many_watches");
  assert.equal((await one("select public.cancel_watch($1) r", [b.id])).r.ok, true);
  await refused(() => db.query("select public.watch_place($1, 48)", [places[11]]), /hours must be 1-24/);
}));

test("nobody sees another person's saved places, alerts, notifications or devices", () => inTx(async () => {
  const a = await newUser("A");
  const b = await newUser("B");
  await setLevel(places[3], 5);
  await actAs(a);
  await db.query("select public.toggle_saved_place($1)", [places[3]]);
  await db.query("select public.watch_place($1, 3)", [places[3]]);
  await db.query("select public.save_push_subscription('https://push.example/a', $1, $2)", ["p".repeat(40), "a".repeat(16)]);
  await actAs(b);
  for (const t of ["saved_places", "place_watches", "notifications", "push_subscriptions"]) {
    assert.equal((await db.query(`select * from public.${t}`)).rowCount, 0, t);
  }
  assert.equal((await one("select public.my_place_state($1) s", [places[3]])).s.saved, false);
  await refused(() => db.query("insert into public.saved_places (user_id, place_id) values ($1, $2)", [b, places[3]]), /permission denied/);
  await refused(() => db.query("select public.check_watches()"), /permission denied/);
  await refused(() => db.query("select public.pending_pushes()"), /permission denied/);
  await refused(() => db.query("select public.verify_push_token('x')"), /permission denied/);
}));

test("push: fired alerts queue a push for people with devices; results mark sent and drop dead devices", () => inTx(async () => {
  const u = await newUser();
  await setLevel(places[4], 5);
  await actAs(u);
  await db.query("select public.save_push_subscription('https://push.example/one', $1, $2)", ["p".repeat(40), "a".repeat(16)]);
  await db.query("select public.save_push_subscription('https://push.example/two', $1, $2)", ["q".repeat(40), "b".repeat(16)]);
  await db.query("select public.watch_place($1, 3)", [places[4]]);
  await setLevel(places[4], 2);
  await asOwner();
  const queued = Number((await one("select count(*) n from net.http_request_queue")).n);
  await db.query("select public.check_watches()");
  assert.ok(Number((await one("select count(*) n from net.http_request_queue")).n) > queued, "site woken up");
  const pending = (await db.query("select * from public.pending_pushes()")).rows.filter((p) => p.place_id === places[4]);
  assert.equal(pending.length, 1);
  assert.equal(pending[0].devices.length, 2);
  await db.query("select public.push_results($1, '{}', $2)", [[pending[0].id], ["https://push.example/two"]]);
  assert.equal((await one("select push_status from public.notifications where id = $1", [pending[0].id])).push_status, "sent");
  assert.equal((await one("select count(*)::int n from public.push_subscriptions where user_id = $1", [u])).n, 1);

  const token = (await one("select value from public.app_settings where key = 'push_token'")).value;
  assert.equal((await one("select public.verify_push_token($1) ok", [token])).ok, true);
  assert.equal((await one("select public.verify_push_token('wrong') ok")).ok, false);
}));
