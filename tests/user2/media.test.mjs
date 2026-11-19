// User 2: photo / video / audio uploads and comments.
// Every test runs in a transaction that is rolled back (Storage rows included).
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
async function actAsAnon() {
  await db.query("reset role");
  await db.query("set local role anon");
  await db.query("select set_config('request.jwt.claims', '{\"role\":\"anon\"}', true)");
}
const asOwner = () => db.query("reset role");
/** Expects an error without aborting the surrounding transaction. */
async function refused(run, pattern) {
  await db.query("savepoint s");
  await assert.rejects(run(), pattern);
  await db.query("rollback to savepoint s");
}

const begin = async ({ kind = "photo", mime = "image/jpeg", size = 200_000, duration = null, caption = "Long queue at the gate",
                       lat = place.lat, lng = place.lng, accuracy = 12 } = {}) =>
  (await db.query("select public.begin_media_upload($1, $2, $3, $4, $5, $6, $7, $8, $9, 3) as r",
    [place.id, kind, mime, size, duration, caption, lat, lng, accuracy])).rows[0].r;
const finish = async (id) => (await db.query("select public.finish_media_upload($1) as r", [id])).rows[0].r;
/** Stands in for the browser uploading the file to Storage. */
async function storeFile(path, size = 200_000, mimetype = "image/jpeg") {
  const role = (await db.query("select current_user u")).rows[0].u;
  await asOwner();
  await db.query("insert into storage.objects (bucket_id, name, metadata) values ('media', $1, $2)",
    [path, { size, mimetype }]);
  if (role !== "postgres") await db.query(`set local role ${role}`);
}
async function postPhoto(uid, opts) {
  await actAs(uid);
  const slot = await begin(opts);
  assert.equal(slot.ok, true, JSON.stringify(slot));
  await storeFile(slot.path);
  await actAs(uid);
  assert.equal((await finish(slot.id)).ok, true);
  return slot.id;
}
const feed = async () => (await db.query("select * from public.place_media($1)", [place.id])).rows;
const comment = async (media, body) => (await db.query("select public.add_comment($1, $2) as r", [media, body])).rows[0].r;

test("upload: a slot at the place, hidden until the file arrives, then public without the uploader's id", () => inTx(async () => {
  const a = await newUser("Asha");
  await actAs(a);
  const slot = await begin();
  assert.equal(slot.ok, true, JSON.stringify(slot));
  assert.match(slot.path, new RegExp(`^${a}/[0-9a-f-]{36}\\.jpg$`));
  assert.equal((await feed()).some((m) => m.id === slot.id), false, "pending is hidden");
  assert.equal((await finish(slot.id)).reason, "not_uploaded");

  await storeFile(slot.path);
  await actAs(a);
  assert.equal((await finish(slot.id)).ok, true);

  await actAsAnon();
  const item = (await feed()).find((m) => m.id === slot.id);
  assert.ok(item, "visible to everyone");
  assert.deepEqual([item.author, item.mine, item.caption, item.kind], ["Asha", false, "Long queue at the gate", "photo"]);
  assert.equal("user_id" in item, false);
  await actAs(a);
  assert.equal((await feed()).find((m) => m.id === slot.id).mine, true);

  await asOwner();
  const log = await db.query("select action from public.audit_log where actor_id = $1 and action like 'media.%'", [a]);
  assert.deepEqual(log.rows.map((r) => r.action), ["media.upload"]);
}));

const setLocationRule = (on) => db.query("update public.app_settings set value = $1 where key = 'media_require_location'", [on ? "true" : "false"]);

test("upload: refused away from the place, with weak GPS, wrong types, long clips, spam captions, too many", () => inTx(async () => {
  await setLocationRule(true); // rolled back with the test
  const a = await newUser();
  await actAs(a);
  assert.equal((await begin({ lng: place.lng + 0.01 })).reason, "not_at_place");
  assert.equal((await begin({ accuracy: 200 })).reason, "low_accuracy");
  assert.equal((await begin({ mime: "image/png" })).reason, "bad_type");
  assert.equal((await begin({ kind: "video", mime: "image/jpeg" })).reason, "bad_type");
  assert.equal((await begin({ size: 30_000_000 })).reason, "too_large");
  assert.equal((await begin({ kind: "video", mime: "video/webm", duration: 45 })).reason, "too_long");
  assert.equal((await begin({ kind: "audio", mime: "audio/webm", duration: null })).reason, "too_long");
  assert.equal((await begin({ caption: "visit www.spam.example now" })).reason, "bad_caption");
  assert.equal((await begin({ caption: "!!!!!!!!!!!!!!!!" })).reason, "bad_caption");
  assert.equal((await begin({ kind: "audio", mime: "audio/webm", duration: 12.5, caption: "" })).ok, true);
  for (let i = 0; i < 9; i++) assert.equal((await begin()).ok, true);
  assert.equal((await begin()).reason, "rate_limited");
  await asOwner();
  const rejected = await db.query("select count(*)::int n from public.audit_log where actor_id = $1 and action = 'media.upload_rejected'", [a]);
  assert.equal(rejected.rows[0].n, 3, "location problems and rate limits are logged for bot detection");
}));

test("upload: a file that doesn't match what was announced is not published", () => inTx(async () => {
  const a = await newUser();
  await actAs(a);
  const slot = await begin();
  await storeFile(slot.path, 200_000, "video/mp4");
  await actAs(a);
  assert.equal((await finish(slot.id)).reason, "file_mismatch");
}));

test("privacy: other users can't read media rows or the bucket directly", () => inTx(async () => {
  const a = await newUser();
  const b = await newUser();
  const id = await postPhoto(a);
  await actAs(b);
  assert.equal((await db.query("select * from public.media where id = $1", [id])).rowCount, 0);
  assert.equal((await db.query("select * from storage.objects where bucket_id = 'media'")).rowCount, 0);
  await actAsAnon();
  await refused(() => db.query("select * from public.media"), /permission denied/);
}));

test("owners edit captions and delete uploads (with their comments); others can't", () => inTx(async () => {
  const a = await newUser("Asha");
  const b = await newUser("Bilal");
  const id = await postPhoto(a);
  await actAs(b);
  assert.equal((await comment(id, "Thanks, very useful")).ok, true);
  await refused(() => db.query("select public.edit_my_media($1, 'hacked')", [id]), /media not found/);
  await refused(() => db.query("select public.delete_my_media($1)", [id]), /media not found/);

  await actAs(a);
  assert.equal((await db.query("select public.edit_my_media($1, 'Queue gone now') as r", [id])).rows[0].r.ok, true);
  const r = (await db.query("select public.delete_my_media($1) as r", [id])).rows[0].r;
  assert.equal(r.ok, true);
  assert.match(r.path, new RegExp(`^${a}/`));
  await asOwner();
  assert.equal((await db.query("select count(*)::int n from public.comments where media_id = $1", [id])).rows[0].n, 0);
  const log = await db.query("select action, details from public.audit_log where target_id = $1 and action like 'media.%' order by id", [id]);
  assert.deepEqual(log.rows.map((x) => x.action), ["media.upload", "media.edit", "media.delete"]);
  assert.equal(log.rows[1].details.old_caption, "Long queue at the gate");
}));

test("comments: anyone signed in can comment; spam, repeats and floods are refused; owners edit and delete", () => inTx(async () => {
  const a = await newUser("Asha");
  const b = await newUser("Bilal");
  const id = await postPhoto(a);
  await actAs(b);
  const c = await comment(id, "Is it still this busy?");
  assert.equal(c.ok, true);
  assert.equal((await comment(id, "is it still this busy?")).reason, "duplicate");
  assert.equal((await comment(id, "http://spam.example")).reason, "bad_text");
  assert.equal((await comment(id, "   ")).reason, "bad_text");
  for (let i = 0; i < 9; i++) assert.equal((await comment(id, `Update number ${i}`)).ok, true);
  assert.equal((await comment(id, "One more")).reason, "rate_limited");

  await actAsAnon();
  const list = (await db.query("select * from public.media_comments($1)", [id])).rows;
  assert.equal(list.length, 10);
  assert.deepEqual([list[0].author, list[0].mine], ["Bilal", false]);
  assert.equal((await feed()).find((m) => m.id === id).comment_count, 10);
  await refused(() => db.query("select public.add_comment($1, 'hello')", [id]), /permission denied/);

  await actAs(a);
  await refused(() => db.query("select public.edit_my_comment($1, 'changed')", [c.id]), /comment not found/);
  await refused(() => db.query("select public.delete_my_comment($1)", [c.id]), /comment not found/);
  await actAs(b);
  assert.equal((await db.query("select public.edit_my_comment($1, 'Is it busy now?') as r", [c.id])).rows[0].r.ok, true);
  assert.equal((await db.query("select count(*)::int n from public.my_comments()")).rows[0].n, 10);
  assert.equal((await db.query("select public.delete_my_comment($1) as r", [c.id])).rows[0].r.ok, true);

  await asOwner();
  const log = await db.query("select action from public.audit_log where target_id = $1 order by id", [c.id]);
  assert.deepEqual(log.rows.map((x) => x.action), ["comment.add", "comment.edit", "comment.delete"]);
}));

test("removed accounts: their uploads and comments disappear for everyone, and they can't post", () => inTx(async () => {
  const a = await newUser("Asha");
  const bot = await newUser("Bot");
  const id = await postPhoto(a);
  const botMedia = await postPhoto(bot);
  await actAs(bot);
  assert.equal((await comment(id, "Buy cheap followers")).ok, true);
  await asOwner();
  await db.query("update public.profiles set status = 'removed', removed_at = now(), removed_reason = 'test' where id = $1", [bot]);

  await actAsAnon();
  assert.deepEqual((await feed()).map((m) => m.id).filter((x) => x === id || x === botMedia), [id]);
  assert.equal((await db.query("select count(*)::int n from public.media_comments($1)", [id])).rows[0].n, 0);
  await actAs(bot);
  await refused(() => begin(), /account removed/);
  await refused(() => comment(id, "again"), /account removed/);
}));

test("location rule switched off: uploads work without a location (or away from the place); on again, they're refused", () => inTx(async () => {
  await setLocationRule(false);
  const a = await newUser();
  await actAs(a);
  assert.equal((await begin({ lat: null, lng: null, accuracy: null })).ok, true, "no location needed while off");
  assert.equal((await begin({ lng: place.lng + 0.05 })).ok, true, "far away is fine while off");
  await db.query("reset role");
  await setLocationRule(true);
  await actAs(a);
  assert.equal((await begin({ lat: null, lng: null, accuracy: null })).reason, "location_required");
  assert.equal((await begin({ lng: place.lng + 0.05 })).reason, "not_at_place");
  await db.query("reset role");
  // Only admins can flip the switch.
  await actAs(a);
  await refused(() => db.query("select public.admin_set_media_location(true)"), /admins only/);
  await db.query("reset role");
}));

test("comments can be reported; the admin sees them in a queue and removes them (logged)", () => inTx(async () => {
  await setLocationRule(false);
  const [poster, troll, reporter] = [await newUser(), await newUser(), await newUser()];
  const mediaId = await postPhoto(poster);
  await actAs(troll);
  const c = await comment(mediaId, "this is a planted rude comment");
  assert.equal(c.ok, true, JSON.stringify(c));
  assert.equal((await db.query("select public.report_comment($1) as r", [c.id])).rows[0].r.reason, "own_comment");
  await actAs(reporter);
  assert.equal((await db.query("select public.report_comment($1) as r", [c.id])).rows[0].r.ok, true);
  assert.equal((await db.query("select public.report_comment($1) as r", [c.id])).rows[0].r.reason, "already_reported");
  await refused(() => db.query("select * from public.admin_comment_report_queue()"), /admins only/);
  await db.query("reset role");
  const admin = (await db.query("select id from public.profiles where role = 'admin' and status = 'active' limit 1")).rows[0]?.id;
  assert.ok(admin, "an admin exists");
  await actAs(admin);
  const queue = (await db.query("select * from public.admin_comment_report_queue()")).rows;
  assert.ok(queue.some((q) => q.comment_id === c.id && q.reports === 1));
  assert.equal((await db.query("select public.admin_resolve_comment_reports($1, 'remove') as r", [c.id])).rows[0].r.ok, true);
  await db.query("reset role");
  assert.equal((await db.query("select status from public.comments where id = $1", [c.id])).rows[0].status, "removed");
  assert.equal((await db.query("select count(*)::int n from public.audit_log where target_id = $1 and action = 'admin.comment_reports'", [c.id])).rows[0].n, 1);
}));
