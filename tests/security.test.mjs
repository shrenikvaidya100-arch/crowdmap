// Review round 1: security hardening. Every test is rolled back.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import pg from "pg";

const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL });
before(() => db.connect());
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
async function actAsAnon() {
  await asOwner();
  await db.query("set local role anon");
  await db.query("select set_config('request.jwt.claims', '{\"role\":\"anon\"}', true)");
}
async function refused(run, pattern) {
  await db.query("savepoint s");
  await assert.rejects(run(), pattern);
  await db.query("rollback to savepoint s");
}

test("visitors can't write to the audit log; users only the app's own actions, rate-limited", () => inTx(async () => {
  await actAsAnon();
  await refused(() => db.query("select public.log_event('auth.login')"), /permission denied/);
  const u = await newUser();
  await actAs(u);
  await refused(() => db.query("select public.log_event('media.upload')"), /not allowed/);
  for (let i = 0; i < 30; i++) await db.query("select public.log_event('auth.logout')");
  await refused(() => db.query("select public.log_event('auth.logout')"), /too many/);
}));

test("trigger functions and the trust list aren't callable or readable by users", () => inTx(async () => {
  const u = await newUser();
  await actAs(u);
  await refused(() => db.query("select * from public.user_trust"), /permission denied/);
  await actAsAnon();
  await refused(() => db.query("select public.handle_new_user()"), /permission denied/);
  await refused(() => db.query("select * from public.my_comments()"), /permission denied/);
}));

test("display names can't contain links", () => inTx(async () => {
  const u = await newUser("Fine Name");
  await actAs(u);
  await refused(() => db.query("update public.profiles set display_name = 'visit www.spam.example' where id = $1", [u]), /display_name_no_links/);
  assert.equal((await db.query("update public.profiles set display_name = 'Still Fine' where id = $1", [u])).rowCount, 1);
}));

test("visit plans: creating and cancelling in a loop is capped per day", () => inTx(async () => {
  const u = await newUser();
  const place = (await db.query("select id from public.places where name = 'Sarafa Bazaar'")).rows[0].id;
  await asOwner();
  for (let i = 0; i < 40; i++) await db.query("select public.log_event_as($1, 'user', 'plan.create', 'visit_plan', null, '{}')", [u]);
  await refused(() => db.query(`insert into public.visit_plans (user_id, place_id, planned_for)
                                values ($1, $2, date_trunc('hour', now()) + interval '2 hours')`, [u, place]), /too many plans/);
}));

test("account deletion: logs what is removed, returns the files, refuses admins; deleting the login cascades", () => inTx(async () => {
  const u = await newUser("Leaving");
  const place = (await db.query("select id from public.places where name = 'Sarafa Bazaar'")).rows[0].id;
  await db.query(`insert into public.media (place_id, user_id, kind, mime, size_bytes, storage_path, status)
                  values ($1, $2, 'photo', 'image/jpeg', 100, $3, 'visible')`, [place, u, `${u}/a.jpg`]);
  await db.query("insert into public.crowd_reports (place_id, user_id, level) values ($1, $2, 3)", [place, u]);
  await actAs(u);
  const r = (await db.query("select public.begin_account_deletion() r")).rows[0].r;
  assert.deepEqual([r.ok, r.paths], [true, [`${u}/a.jpg`]]);
  await asOwner();
  const log = (await db.query("select details from public.audit_log where actor_id = $1 and action = 'account.delete'", [u])).rows[0];
  assert.deepEqual([log.details.uploads, log.details.reports], [1, 1]);
  await db.query("delete from auth.users where id = $1", [u]);   // what the server's admin API call does
  for (const t of ["profiles", "media", "crowd_reports"]) {
    const col = t === "profiles" ? "id" : "user_id";
    assert.equal((await db.query(`select count(*)::int n from public.${t} where ${col} = $1`, [u])).rows[0].n, 0, t);
  }
  assert.ok((await db.query("select count(*)::int n from public.audit_log where actor_id = $1", [u])).rows[0].n > 0, "log kept");

  const existing = Number((await db.query("select count(*) n from public.profiles where role = 'admin'")).rows[0].n);
  if (existing < 2) {
    const a = await newUser("Admin");
    await db.query("update public.profiles set role = 'admin' where id = $1", [a]);
    await actAs(a);
    assert.equal((await db.query("select public.begin_account_deletion() r")).rows[0].r.reason, "admin");
  }
}));
