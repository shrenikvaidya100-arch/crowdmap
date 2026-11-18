// User 2: automatic bot detection. Every test is rolled back.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import pg from "pg";

const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL });
let places;
before(async () => {
  await db.connect();
  places = (await db.query("select id, lat, lng from public.places where city_id = 'indore' and status = 'listed' and not is_sample order by name limit 12")).rows;
});
after(() => db.end());

async function inTx(fn) {
  await db.query("begin");
  try { await fn(); } finally { await db.query("rollback"); }
}
const asOwner = () => db.query("reset role");
async function newUser(name = "Member", { admin = false, ageDays = 3 } = {}) {
  await asOwner();
  const id = randomUUID();
  await db.query(`insert into auth.users (id, email, aud, role, raw_user_meta_data)
                  values ($1, $2, 'authenticated', 'authenticated', $3)`, [id, `${id}@test.invalid`, { display_name: name }]);
  await db.query("update public.profiles set created_at = now() - make_interval(days => $2) where id = $1", [id, ageDays]);
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
/** n rejected GPS checks with this reason (and the audit entries a real rejection writes). */
async function rejections(uid, reason, n) {
  await asOwner();
  for (let i = 0; i < n; i++) {
    await db.query(`insert into public.location_checks (user_id, lat, lng, accuracy_m, source, accepted, reason, place_id)
                    values ($1, $2, $3, 20, 'crowd_report', false, $4, $5)`, [uid, places[0].lat, places[0].lng, reason, places[0].id]);
    await db.query("select public.log_event_as($1, 'user', 'crowd.report_rejected', 'place', $2, $3)",
      [uid, places[0].id, { reason }]);
  }
}
const sweep = async () => { await asOwner(); return (await db.query("select public.bot_sweep() r")).rows[0].r; };
const profile = async (id) => { await asOwner(); return (await db.query("select status, removed_reason, trust_score from public.profiles where id = $1", [id])).rows[0]; };
const flags = async (id) => (await db.query("select outcome, score, signals from public.bot_flags where user_id = $1 order by id", [id])).rows;

test("impossible travel removes the account automatically, logged with the evidence", () => inTx(async () => {
  const bot = await newUser("Teleporter");
  await rejections(bot, "impossible_travel", 3);
  const res = await sweep();
  assert.ok(res.removed >= 1, JSON.stringify(res));
  const p = await profile(bot);
  assert.equal(p.status, "removed");
  assert.match(p.removed_reason, /^Automatic: Impossible travel between GPS checks \(3\)/);
  assert.deepEqual((await flags(bot)).map((f) => [f.outcome, f.score, f.signals.impossible_travel]), [["removed", 100, 3]]);
  const log = await db.query("select actor_role, details from public.audit_log where target_id = $1 and action = 'system.bot_removed'", [bot]);
  assert.equal(log.rows[0].actor_role, "system");
  assert.equal(log.rows[0].details.signals.impossible_travel, 3);
  assert.equal((await db.query("select public.is_removed($1) r", [bot])).rows[0].r, true);
}));

test("bursts across many places plus rate limits add up to removal; one weaker signal only flags", () => inTx(async () => {
  const burst = await newUser("Burst");
  await asOwner();
  for (const p of places.slice(0, 8)) {
    await db.query("insert into public.crowd_reports (place_id, user_id, level) values ($1, $2, 5)", [p.id, burst]);
  }
  await db.query("select public.log_event_as($1, 'user', 'crowd.report', 'place', $2, '{}')", [burst, places[0].id]);
  await rejections(burst, "rate_limited", 5);

  const lonely = await newUser("Wanderer");
  await rejections(lonely, "not_at_place", 15);

  await sweep();
  assert.equal((await profile(burst)).status, "removed");
  assert.deepEqual(Object.keys((await flags(burst))[0].signals).sort(), ["burst_places", "rate_limited"]);
  const w = await profile(lonely);
  assert.deepEqual([w.status, w.trust_score <= 0.2], ["active", true], "flagged: still active, trust lowered");
  assert.equal((await flags(lonely))[0].outcome, "flagged");
}));

test("ordinary users, admins and quiet accounts are left alone; flags aren't repeated every sweep", () => inTx(async () => {
  const normal = await newUser("Normal");
  await rejections(normal, "low_accuracy", 6);        // bad GPS is not a bot signal
  await rejections(normal, "impossible_travel", 1);   // one odd jump is tolerated
  const admin = await newUser("Admin", { admin: true });
  await rejections(admin, "impossible_travel", 5);
  const wanderer = await newUser("Wanderer");
  await rejections(wanderer, "not_at_place", 15);

  await sweep();
  assert.equal((await profile(normal)).status, "active");
  assert.equal((await flags(normal)).length, 0);
  assert.equal((await profile(admin)).status, "active", "admins are never auto-removed");
  await sweep();
  assert.equal((await flags(wanderer)).length, 1, "same evidence, no second flag");
}));

test("a removal an admin reversed is not repeated on the same evidence, but new evidence counts", () => inTx(async () => {
  const admin = await newUser("Admin", { admin: true });
  const user = await newUser("Fast Traveller");
  await rejections(user, "impossible_travel", 3);
  await sweep();
  assert.equal((await profile(user)).status, "removed");

  await actAs(admin);
  await db.query("select public.admin_set_user_status($1, 'active', 'was on a flight, GPS glitch')", [user]);
  // Make the restore clearly later than the old evidence.
  await asOwner();
  await db.query("update public.location_checks set at = at - interval '1 minute' where user_id = $1", [user]);
  await sweep();
  assert.equal((await profile(user)).status, "active", "old evidence ignored after restore");

  // The audit log uses the real clock, so date the new evidence after the restore.
  await rejections(user, "impossible_travel", 3);
  await db.query("update public.location_checks set at = clock_timestamp() + interval '1 minute' where user_id = $1 and at > now() - interval '1 second'", [user]);
  await sweep();
  assert.equal((await profile(user)).status, "removed", "fresh evidence after restore");
}));

test("duplicate uploads, spam text and fake places are detected", () => inTx(async () => {
  const spammer = await newUser("Spammer");
  await asOwner();
  for (let i = 0; i < 4; i++) {
    const path = `${spammer}/${randomUUID()}.jpg`;
    await db.query(`insert into public.media (place_id, user_id, kind, mime, size_bytes, storage_path, status)
                    values ($1, $2, 'photo', 'image/jpeg', 1000, $3, 'visible')`, [places[0].id, spammer, path]);
    await db.query("insert into storage.objects (bucket_id, name, metadata) values ('media', $1, $2)",
      [path, { size: 1000, mimetype: "image/jpeg", eTag: '"same-file"' }]);
  }
  for (let i = 0; i < 5; i++) {
    await db.query("select public.log_event_as($1, 'user', 'comment.rejected', 'media', null, $2)", [spammer, { reason: "duplicate" }]);
  }
  const s = (await db.query("select public.bot_signals($1) s", [spammer])).rows[0].s;
  assert.deepEqual([s.duplicate_media, s.junk_text], [3, 5]);
  await sweep();
  assert.equal((await profile(spammer)).status, "removed");

  const faker = await newUser("Faker");
  await db.query(`insert into public.places (city_id, name, category, lat, lng, status, added_by)
                  values ('indore', 'Fake Shop One', 'cafe', 22.72, 75.86, 'removed', $1),
                         ('indore', 'Fake Shop Two', 'cafe', 22.73, 75.87, 'removed', $1)`, [faker]);
  assert.equal((await db.query("select public.bot_signals($1) s", [faker])).rows[0].s.fake_places, 2);
}));

test("only the database and admins can run the sweep; admins can review flags", () => inTx(async () => {
  const u = await newUser();
  const admin = await newUser("Admin", { admin: true });
  const wanderer = await newUser("Wanderer");
  await rejections(wanderer, "not_at_place", 15);
  await actAs(u);
  await refused(() => db.query("select public.bot_sweep()"), /permission denied/);
  await refused(() => db.query("select public.admin_run_bot_sweep()"), /admins only/);
  assert.equal((await db.query("select * from public.bot_flags")).rowCount, 0, "flags are admin-only");

  await actAs(admin);
  const res = (await db.query("select public.admin_run_bot_sweep() r")).rows[0].r;
  assert.ok(res.flagged >= 1, JSON.stringify(res));
  const flag = (await db.query("select * from public.admin_bot_flags(p_open_only => true)")).rows.find((f) => f.user_id === wanderer);
  assert.equal(flag.display_name, "Wanderer");
  assert.equal((await db.query("select public.admin_review_flag($1, true) r", [flag.id])).rows[0].r.ok, true);
  assert.equal((await profile(wanderer)).trust_score, 0.5, "false alarm restores trust");
  await asOwner();
  const log = await db.query("select action from public.audit_log where actor_id = $1 order by id", [admin]);
  assert.deepEqual(log.rows.map((r) => r.action).filter((a) => a.startsWith("admin.")), ["admin.bot_sweep", "admin.bot_flag_reviewed"]);
}));

test("the sweep is scheduled every 10 minutes", async () => {
  const job = (await db.query("select schedule, command from cron.job where jobname = 'crowdmap-bot-sweep'")).rows[0];
  assert.deepEqual(job, { schedule: "*/10 * * * *", command: "select public.bot_sweep()" });
});
