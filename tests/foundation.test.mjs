// Foundation database tests. Each test runs inside a transaction that is rolled
// back, so nothing (not even audit entries) is left behind.
// Run: npm run test:db   (needs SUPABASE_DB_URL in .env.local)
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL });
before(() => client.connect());
after(() => client.end());

/** Runs fn in a transaction that is always rolled back. */
async function inTx(fn) {
  await client.query("begin");
  try { await fn(); } finally { await client.query("rollback"); }
}

/** Expects the statement to fail; uses a savepoint so the transaction survives. */
async function rejects(sql, params, pattern) {
  await client.query("savepoint s");
  try {
    await client.query(sql, params);
    assert.fail(`expected failure: ${sql}`);
  } catch (err) {
    if (err.code === "ERR_ASSERTION") throw err;
    if (pattern) assert.match(err.message, pattern);
  } finally {
    await client.query("rollback to savepoint s");
  }
}

async function newUser(name) {
  const id = randomUUID();
  await client.query(
    `insert into auth.users (id, email, aud, role, raw_user_meta_data)
     values ($1, $2, 'authenticated', 'authenticated', $3)`,
    [id, `${id}@test.invalid`, { display_name: name }],
  );
  return id;
}

async function actAs(userId) {
  await client.query("set local role authenticated");
  await client.query("select set_config('request.jwt.claims', $1, true)",
    [JSON.stringify({ sub: userId, role: "authenticated" })]);
}
const actAsOwner = () => client.query("reset role");

test("the three launch cities are seeded", async () => {
  const { rows } = await client.query("select id from public.cities order by sort_order");
  assert.deepEqual(rows.map((r) => r.id), ["indore", "delhi", "mumbai"]);
});

test("sign-up creates a profile and an audit entry", () => inTx(async () => {
  const id = await newUser("Asha");
  const p = await client.query("select display_name, role, status from public.profiles where id = $1", [id]);
  assert.deepEqual(p.rows[0], { display_name: "Asha", role: "user", status: "active" });
  const a = await client.query("select action from public.audit_log where target_id = $1", [id]);
  assert.deepEqual(a.rows.map((r) => r.action), ["auth.signup"]);
}));

test("audit log cannot be edited or deleted, even by the database owner", () => inTx(async () => {
  const id = await newUser("Ravi");
  await rejects("update public.audit_log set action = 'x.y' where target_id = $1", [id], /append-only/);
  await rejects("delete from public.audit_log where target_id = $1", [id], /append-only/);
  await rejects("truncate public.audit_log", [], /append-only/);
}));

test("users can log their own events but cannot write the log directly or fake admin events", () => inTx(async () => {
  const id = await newUser("Meera");
  await actAs(id);
  const { rows } = await client.query("select public.log_event('crowd.report', 'place', 'p1') as id");
  assert.ok(rows[0].id > 0);
  await rejects(`insert into public.audit_log (actor_id, actor_role, action, prev_hash, hash)
                 values ($1, 'admin', 'admin.fake', '', '')`, [id], /permission denied/);
  await rejects("select public.log_event('admin.remove_user')", [], /admin events need an admin/);
  await rejects("select public.log_event_as(null, 'system', 'system.x')", [], /permission denied/);
  await actAsOwner();
}));

test("hash chain verifies, and links each entry to the previous one", () => inTx(async () => {
  await newUser("Kiran");
  await newUser("Dev");
  const { rows } = await client.query("select public.verify_audit_chain() as broken");
  assert.equal(rows[0].broken, null);
  const last = await client.query("select prev_hash, hash from public.audit_log order by id desc limit 2");
  assert.equal(last.rows[0].prev_hash, last.rows[1].hash);
}));

test("users cannot make themselves admin or see other users' profiles", () => inTx(async () => {
  const a = await newUser("Alpha");
  const b = await newUser("Bravo");
  await actAs(a);
  await rejects("update public.profiles set role = 'admin' where id = $1", [a], /permission denied/);
  await rejects("update public.profiles set status = 'removed' where id = $1", [a], /permission denied/);
  const own = await client.query("update public.profiles set display_name = 'Alpha 2' where id = $1 returning id", [a]);
  assert.equal(own.rowCount, 1);
  const other = await client.query("select id from public.profiles where id = $1", [b]);
  assert.equal(other.rowCount, 0);
  await actAsOwner();
}));

test("there can never be more than two admins", () => inTx(async () => {
  const existing = await client.query("select count(*)::int as n from public.profiles where role = 'admin'");
  const room = 2 - existing.rows[0].n;
  const ids = [];
  for (let i = 0; i <= room; i++) ids.push(await newUser(`Admin ${i}`));
  for (const id of ids.slice(0, room)) {
    await client.query("update public.profiles set role = 'admin' where id = $1", [id]);
  }
  await rejects("update public.profiles set role = 'admin' where id = $1", [ids[room]], /at most 2 admins/);
  const log = await client.query(
    "select count(*)::int as n from public.audit_log where action = 'admin.role_change' and target_id = any($1)",
    [ids.slice(0, room)]);
  assert.equal(log.rows[0].n, room);
}));

test("visitors who are not signed in can read cities and places but not profiles or the log", () => inTx(async () => {
  await client.query("set local role anon");
  const c = await client.query("select count(*)::int as n from public.cities");
  assert.equal(c.rows[0].n, 3);
  await client.query("select count(*) from public.places");
  await rejects("select * from public.profiles", [], /permission denied/);
  await rejects("select * from public.audit_log", [], /permission denied/);
  await actAsOwner();
}));
