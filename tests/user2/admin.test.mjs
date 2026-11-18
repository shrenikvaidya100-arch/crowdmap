// User 2: admin powers and their limits. Every test is rolled back.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import pg from "pg";

const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL });
let place;
before(async () => {
  await db.connect();
  place = (await db.query("select id, lat, lng from public.places where name = 'Sarafa Bazaar'")).rows[0];
});
after(() => db.end());

async function inTx(fn) {
  await db.query("begin");
  try { await fn(); } finally { await db.query("rollback"); }
}
async function newUser(name = "Member", { admin = false } = {}) {
  await db.query("reset role");
  const id = randomUUID();
  await db.query(`insert into auth.users (id, email, aud, role, raw_user_meta_data)
                  values ($1, $2, 'authenticated', 'authenticated', $3)`, [id, `${id}@test.invalid`, { display_name: name }]);
  if (admin) await db.query("update public.profiles set role = 'admin' where id = $1", [id]);
  return id;
}
async function actAs(id) {
  await db.query("reset role");
  await db.query("set local role authenticated");
  await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: id, role: "authenticated" })]);
}
const asOwner = () => db.query("reset role");
async function refused(run, pattern) {
  await db.query("savepoint s");
  await assert.rejects(run(), pattern);
  await db.query("rollback to savepoint s");
}
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];

/** A visible photo with one comment, owned by uid (inserted directly, as the owner). */
async function seedMedia(uid, commenter) {
  await asOwner();
  const m = await one(`insert into public.media (place_id, user_id, kind, mime, size_bytes, caption, storage_path, status)
                       values ($1, $2, 'photo', 'image/jpeg', 1000, 'Busy gate', $3, 'visible') returning id`,
                      [place.id, uid, `${uid}/${randomUUID()}.jpg`]);
  const c = await one("insert into public.comments (media_id, user_id, body) values ($1, $2, 'Thanks!') returning id", [m.id, commenter ?? uid]);
  return { media: m.id, comment: c.id };
}
const publicFeed = async () => (await db.query("select id from public.place_media($1)", [place.id])).rows.map((r) => r.id);

test("only active admins can use admin functions", () => inTx(async () => {
  const u = await newUser();
  await actAs(u);
  for (const sql of [
    "select public.admin_stats()",
    "select * from public.admin_users()",
    "select * from public.admin_media()",
    "select * from public.admin_comments()",
    "select * from public.admin_audit_log()",
    "select public.admin_verify_audit_chain()",
    `select public.admin_set_user_status('${u}', 'removed', 'testing')`,
  ]) await refused(() => db.query(sql), /admins only/);

  const a = await newUser("Admin", { admin: true });
  await asOwner();
  await db.query("update public.profiles set status = 'removed' where id = $1", [a]);
  await actAs(a);
  await refused(() => db.query("select public.admin_stats()"), /admins only/);
}));

test("the 2-admin cap holds", () => inTx(async () => {
  const existing = Number((await one("select count(*) n from public.profiles where role = 'admin' and status = 'active'")).n);
  for (let i = existing; i < 2; i++) await newUser(`Admin ${i}`, { admin: true });
  const extra = await newUser("Third");
  await refused(() => db.query("update public.profiles set role = 'admin' where id = $1", [extra]), /admin/i);
}));

test("removing an account hides its content everywhere; restoring brings it back; both logged with the reason", () => inTx(async () => {
  const admin = await newUser("Admin", { admin: true });
  const bot = await newUser("Spammy");
  const asha = await newUser("Asha");
  const own = await seedMedia(bot, bot);
  const other = await seedMedia(asha, bot);

  await actAs(admin);
  assert.equal((await one("select public.admin_set_user_status($1, 'removed', '') r", [bot])).r.reason, "need_reason");
  assert.equal((await one("select public.admin_set_user_status($1, 'removed', 'posting ads') r", [bot])).r.ok, true);
  assert.equal((await one("select public.admin_set_user_status($1, 'removed', 'again') r", [bot])).r.reason, "no_change");

  const feed = await publicFeed();
  assert.equal(feed.includes(own.media), false, "bot's upload hidden");
  assert.equal(feed.includes(other.media), true);
  assert.equal(Number((await one("select count(*) n from public.media_comments($1)", [other.media])).n), 0, "bot's comment hidden");
  assert.equal((await one("select count(*)::int n from public.media where id = $1", [own.media])).n, 1, "kept, not deleted");

  assert.equal((await one("select public.admin_set_user_status($1, 'active', 'false alarm') r", [bot])).r.ok, true);
  assert.equal((await publicFeed()).includes(own.media), true, "restored");
  await asOwner();
  const p = await one("select status, removed_reason from public.profiles where id = $1", [bot]);
  assert.deepEqual(p, { status: "active", removed_reason: null });
  const log = await db.query("select action, details->>'reason' reason from public.audit_log where target_id = $1 and action like 'admin.%' order by id", [bot]);
  assert.deepEqual(log.rows.map((r) => `${r.action}:${r.reason ?? ""}`), [
    "admin.status_change:posting ads", "admin.user_remove:posting ads",
    "admin.status_change:", "admin.user_restore:false alarm",
  ]);
}));

test("admins can't remove themselves or the other admin", () => inTx(async () => {
  const existing = Number((await one("select count(*) n from public.profiles where role = 'admin' and status = 'active'")).n);
  const a = await newUser("Admin A", { admin: true });
  const b = existing < 1 ? await newUser("Admin B", { admin: true }) : null;
  await actAs(a);
  assert.equal((await one("select public.admin_set_user_status($1, 'removed', 'test reason') r", [a])).r.reason, "not_yourself");
  if (b) assert.equal((await one("select public.admin_set_user_status($1, 'removed', 'test reason') r", [b])).r.reason, "not_admins");
}));

test("admins hide and restore single uploads and comments, with reasons, logged", () => inTx(async () => {
  const admin = await newUser("Admin", { admin: true });
  const asha = await newUser("Asha");
  const bilal = await newUser("Bilal");
  const { media, comment } = await seedMedia(asha, bilal);

  await actAs(admin);
  assert.equal((await one("select public.admin_set_media_status($1, 'removed', 'face visible') r", [media])).r.ok, true);
  assert.equal((await publicFeed()).includes(media), false);
  const listed = (await db.query("select * from public.admin_media('removed')")).rows.find((r) => r.id === media);
  assert.deepEqual([listed.removed_by, listed.removed_reason, listed.author], ["admin", "face visible", "Asha"]);
  assert.equal((await one("select public.admin_set_media_status($1, 'visible', 'blurred now') r", [media])).r.ok, true);
  assert.equal((await publicFeed()).includes(media), true);

  assert.equal((await one("select public.admin_set_comment_status($1, 'removed', 'rude') r", [comment])).r.ok, true);
  assert.equal(Number((await one("select count(*) n from public.media_comments($1)", [media])).n), 0);
  assert.equal((await db.query("select * from public.admin_comments('removed', 'Bilal')")).rows.some((r) => r.id === comment), true);
  assert.equal((await one("select public.admin_set_comment_status($1, 'visible', 'appeal ok') r", [comment])).r.ok, true);
  assert.equal(Number((await one("select count(*) n from public.media_comments($1)", [media])).n), 1);

  await asOwner();
  const log = await db.query("select action from public.audit_log where actor_id = $1 and action like 'admin.%' order by id", [admin]);
  assert.deepEqual(log.rows.map((r) => r.action),
    ["admin.media_remove", "admin.media_restore", "admin.comment_remove", "admin.comment_restore"]);
}));

test("user list: search, filter, sort and counts", () => inTx(async () => {
  const admin = await newUser("Admin", { admin: true });
  const tag = randomUUID().slice(0, 8);
  const busy = await newUser(`Zed ${tag}`);
  const quiet = await newUser(`Amy ${tag}`);
  await seedMedia(busy, busy);
  await actAs(admin);
  const rows = (await db.query("select * from public.admin_users($1, null, 'name')", [tag])).rows;
  assert.deepEqual(rows.map((r) => r.display_name), [`Amy ${tag}`, `Zed ${tag}`]);
  assert.equal(Number(rows[0].total), 2);
  assert.match(rows[0].email, /@test\.invalid$/);
  const byContrib = (await db.query("select * from public.admin_users($1, null, 'contributions')", [tag])).rows;
  assert.deepEqual([byContrib[0].id, byContrib[0].media, byContrib[0].comments], [busy, 1, 1]);
  await db.query("select public.admin_set_user_status($1, 'removed', 'test removal')", [quiet]);
  const removed = (await db.query("select id from public.admin_users($1, 'removed')", [tag])).rows;
  assert.deepEqual(removed.map((r) => r.id), [quiet]);
}));

test("audit log viewer filters, pages, and chain check is itself logged", () => inTx(async () => {
  const admin = await newUser("Admin", { admin: true });
  const u = await newUser("Filter Target");
  await actAs(admin);
  await db.query("select public.admin_set_user_status($1, 'removed', 'test one')", [u]);
  const rows = (await db.query("select * from public.admin_audit_log(p_target => $1)", [u])).rows;
  assert.deepEqual(rows.map((r) => r.action), ["admin.user_remove", "admin.status_change", "auth.signup"]);
  assert.equal(rows[0].actor_name, "Admin");
  const removes = (await db.query("select * from public.admin_audit_log(p_action => 'admin.user_', p_target => $1)", [u])).rows;
  assert.deepEqual(removes.map((r) => r.action), ["admin.user_remove"]);
  const page2 = (await db.query("select * from public.admin_audit_log(p_target => $1, p_before => $2)", [u, rows[0].id])).rows;
  assert.equal(page2.length, 2);

  const v = (await one("select public.admin_verify_audit_chain() r")).r;
  assert.equal(v.intact, true, JSON.stringify(v));
  const last = (await db.query("select * from public.admin_audit_log(p_limit => 1)")).rows[0];
  assert.equal(last.action, "admin.audit_verify");
  assert.equal(last.details.intact, true);

  const stats = (await one("select public.admin_stats() r")).r;
  assert.ok(stats.audit_entries > 0 && stats.users_removed >= 1, JSON.stringify(stats));
}));
