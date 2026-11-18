// Design steps 10, 12, 13: search log, interest stats, avatar seed and name
// rules, photo reports. Every test is rolled back.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import pg from "pg";

const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL });
let place;
before(async () => {
  await db.connect();
  place = (await db.query("select id from public.places where name = 'Sarafa Bazaar'")).rows[0].id;
});
after(() => db.end());

async function inTx(fn) {
  await db.query("begin");
  try { await fn(); } finally { await db.query("rollback"); }
}
const asOwner = () => db.query("reset role");
async function newUser(name = "Member", { admin = false } = {}) {
  await asOwner();
  const id = randomUUID();
  await db.query(`insert into auth.users (id, email, aud, role, raw_user_meta_data)
                  values ($1, $2, 'authenticated', 'authenticated', $3)`, [id, `${id}@test.invalid`, { display_name: name }]);
  if (admin) await db.query("update public.profiles set role = 'admin' where id = $1", [id]);
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
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];

test("search log: server only, no identities, repeats within 10 s count once, admins read the daily counts", () => inTx(async () => {
  const u = await newUser();
  await actAs(u);
  await refused(() => db.query("select public.log_search('sarafa', 'indore', 3, true)"), /permission denied/);
  await asOwner();
  const before = Number((await one("select count(*) n from public.search_log")).n);
  await db.query("select public.log_search('  Sarafa   Bazaar ', 'indore', 3, true)");
  await db.query("select public.log_search('sarafa bazaar', 'indore', 3, true)");
  await db.query("select public.log_search('x', null, 0, false)");
  assert.equal(Number((await one("select count(*) n from public.search_log")).n) - before, 1);
  const cols = (await db.query("select column_name from information_schema.columns where table_schema='public' and table_name='search_log'")).rows.map((r) => r.column_name);
  assert.equal(cols.some((c) => /user|ip|email/.test(c)), false, "no identity columns");

  await actAs(u);
  await refused(() => db.query("select * from public.admin_search_daily(30)"), /admins only/);
  assert.equal((await db.query("select * from public.search_log")).rowCount, 0);
  const admin = await newUser("Admin", { admin: true });
  await actAs(admin);
  const days = (await db.query("select * from public.admin_search_daily(30)")).rows;
  assert.equal(days.length, 30);
  assert.ok(days.at(-1).n >= 1);
  assert.equal((await db.query("select * from public.admin_recent_searches(5)")).rows[0].query, "sarafa bazaar");
}));

test("interests: saved places and reminders, with unique people and top places", () => inTx(async () => {
  const a = await newUser("A");
  const b = await newUser("B");
  await asOwner();
  await db.query("insert into public.saved_places (user_id, place_id) values ($1, $2), ($3, $2)", [a, place, b]);
  await db.query("insert into public.place_watches (user_id, place_id, expires_at) values ($1, $2, now() + interval '1 hour')", [a, place]);
  const admin = await newUser("Admin", { admin: true });
  await actAs(admin);
  const s = (await one("select public.admin_interest_stats(30) s")).s;
  assert.ok(s.total >= 3 && s.users >= 2, JSON.stringify(s));
  assert.equal(s.daily.length, 30);
  assert.ok(s.top.some((p) => p.id === place && p.n >= 3));
}));

test("avatar seed is saved on the profile; names can't hold an email address or phone number", () => inTx(async () => {
  const u = await newUser("Asha");
  await actAs(u);
  assert.equal((await db.query("update public.profiles set avatar_seed = 'asha:3', display_name = 'Asha K' where id = $1", [u])).rowCount, 1);
  for (const bad of ["mail me a@b.co", "call 98765 43210"]) {
    await refused(() => db.query("update public.profiles set display_name = $2 where id = $1", [u, bad]), /display_name_private/);
  }
  await refused(() => db.query("update public.profiles set role = 'admin' where id = $1", [u]), /permission denied/);
}));

test("reports: others can report an upload once; admins keep or hide it; logged", () => inTx(async () => {
  const owner = await newUser("Owner");
  const r1 = await newUser("R1");
  const r2 = await newUser("R2");
  await asOwner();
  const m = (await one(`insert into public.media (place_id, user_id, kind, mime, size_bytes, storage_path, status)
                         values ($1, $2, 'photo', 'image/jpeg', 100, $3, 'visible') returning id`, [place, owner, `${owner}/r.jpg`])).id;
  await actAs(owner);
  assert.equal((await one("select public.report_media($1, 'spam') r", [m])).r.reason, "own_media");
  await actAs(r1);
  assert.equal((await one("select public.report_media($1, 'spam', 'ads') r", [m])).r.ok, true);
  assert.equal((await one("select public.report_media($1, 'spam') r", [m])).r.reason, "already_reported");
  await actAs(r2);
  assert.equal((await one("select public.report_media($1, 'private_info') r", [m])).r.ok, true);
  await refused(() => db.query("select * from public.admin_report_queue()"), /admins only/);

  const admin = await newUser("Admin", { admin: true });
  await actAs(admin);
  const q = (await db.query("select * from public.admin_report_queue()")).rows.find((r) => r.media_id === m);
  assert.deepEqual([q.reports, [...q.reasons].sort()], [2, ["private_info", "spam"]]);
  assert.equal((await one("select public.admin_resolve_reports($1, 'hide') r", [m])).r.reports, 2);
  await asOwner();
  assert.equal((await one("select status from public.media where id = $1", [m])).status, "removed");
  assert.equal(Number((await one("select count(*) n from public.media_reports where media_id = $1 and status = 'open'", [m])).n), 0);
  assert.equal((await one("select action from public.audit_log where target_id = $1 order by id desc limit 1", [m])).action, "admin.media_remove");
}));
