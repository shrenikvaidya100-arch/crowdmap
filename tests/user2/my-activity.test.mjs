// User 2: "My activity" shows only the signed-in user's own rows, and profile
// edits are limited to safe fields and audited. Rolled back after each test.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import pg from "pg";

const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL });
let place;
before(async () => {
  await db.connect();
  place = (await db.query("select id, lat, lng, city_id from public.places where name = 'Sarafa Bazaar'")).rows[0];
});
after(() => db.end());

async function inTx(fn) {
  await db.query("begin");
  try { await fn(); } finally { await db.query("rollback"); }
}
async function newUser(name = "Member") {
  await db.query("reset role");
  const id = randomUUID();
  await db.query(`insert into auth.users (id, email, aud, role, raw_user_meta_data)
                  values ($1, $2, 'authenticated', 'authenticated', $3)`, [id, `${id}@test.invalid`, { display_name: name }]);
  return id;
}
async function actAs(id) {
  await db.query("reset role");
  await db.query("set local role authenticated");
  await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: id, role: "authenticated" })]);
}

/** Gives a user one of everything shown on My activity. */
async function seedActivity(uid) {
  await db.query("reset role");
  await db.query("insert into public.crowd_reports (place_id, user_id, level) values ($1, $2, 3)", [place.id, uid]);
  await db.query(`insert into public.quick_reports (user_id, kind, place_id, city_id, lat, lng, expires_at)
                  values ($1, 'long_queue', $2, $3, $4, $5, now() + interval '1 hour')`, [uid, place.id, place.city_id, place.lat, place.lng]);
  await db.query(`insert into public.visit_plans (user_id, place_id, planned_for)
                  values ($1, $2, date_trunc('hour', (now() + interval '1 day') at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata')`, [uid, place.id]);
}

const countOwn = async (uid) => ({
  reports: (await db.query("select count(*)::int n from public.crowd_reports where user_id = $1", [uid])).rows[0].n,
  alerts: (await db.query("select count(*)::int n from public.quick_reports where user_id = $1", [uid])).rows[0].n,
  plans: (await db.query("select count(*)::int n from public.visit_plans where user_id = $1", [uid])).rows[0].n,
  log: (await db.query("select count(*)::int n from public.audit_log where actor_id = $1", [uid])).rows[0].n,
});

test("users see their own reports, alerts, plans and log entries", () => inTx(async () => {
  const a = await newUser("Asha");
  await seedActivity(a);
  await actAs(a);
  const own = await countOwn(a);
  assert.deepEqual({ ...own, log: own.log > 0 }, { reports: 1, alerts: 1, plans: 1, log: true });
}));

test("...and none of anyone else's", () => inTx(async () => {
  const a = await newUser("Asha");
  const b = await newUser("Bilal");
  await seedActivity(a);
  await actAs(b);
  assert.deepEqual(await countOwn(a), { reports: 0, alerts: 0, plans: 0, log: 0 });
}));

test("profile: name, language and home city can change and are audited; nothing else can", () => inTx(async () => {
  const a = await newUser("Asha");
  await actAs(a);
  const ok = await db.query(
    "update public.profiles set display_name = 'Asha K', preferred_lang = 'hi', home_city = 'mumbai' where id = $1", [a]);
  assert.equal(ok.rowCount, 1);
  for (const col of ["trust_score = 1", "role = 'admin'", "status = 'removed'", "created_at = now() - interval '1 year'"]) {
    await db.query("savepoint s");
    await assert.rejects(db.query(`update public.profiles set ${col} where id = $1`, [a]), /permission denied/, col);
    await db.query("rollback to savepoint s");
  }
  await db.query("reset role");
  const log = await db.query("select action from public.audit_log where actor_id = $1 and action = 'profile.update'", [a]);
  assert.equal(log.rowCount, 1);
}));

test("profile rules: bad names, languages and cities are refused by the database", () => inTx(async () => {
  const a = await newUser("Asha");
  await actAs(a);
  for (const set of ["display_name = 'x'", "preferred_lang = 'fr'", "home_city = 'atlantis'"]) {
    await db.query("savepoint s");
    await assert.rejects(db.query(`update public.profiles set ${set} where id = $1`, [a]), undefined, set);
    await db.query("rollback to savepoint s");
  }
}));
