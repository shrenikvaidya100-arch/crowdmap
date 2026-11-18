// Review round 2: housekeeping jobs. Every test is rolled back.
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
async function newUser() {
  const id = randomUUID();
  await db.query(`insert into auth.users (id, email, aud, role, raw_user_meta_data)
                  values ($1, $2, 'authenticated', 'authenticated', '{"display_name":"Member"}')`, [id, `${id}@test.invalid`]);
  return id;
}

test("hourly maintenance clears stale presence and old GPS checks, keeps recent ones", () => inTx(async () => {
  const u = await newUser();
  await db.query(`insert into public.presence (user_id, lat, lng, accuracy_m, city_id, updated_at)
                  values ($1, $2, $3, 10, $4, now() - interval '2 hours')`, [u, place.lat, place.lng, place.city_id]);
  await db.query(`insert into public.location_checks (user_id, lat, lng, accuracy_m, source, accepted, at) values
                  ($1, 22.7, 75.8, 10, 'crowd_report', true, now() - interval '100 days'),
                  ($1, 22.7, 75.8, 10, 'crowd_report', true, now() - interval '10 days')`, [u]);
  const r = (await db.query("select public.maintenance() r")).rows[0].r;
  assert.ok(r.presence >= 1 && r.location_checks >= 1, JSON.stringify(r));
  assert.equal((await db.query("select count(*)::int n from public.location_checks where user_id = $1", [u])).rows[0].n, 1);
}));

test("cleanup lists unfinished uploads and orphan files older than an hour, nothing recent or published", () => inTx(async () => {
  const u = await newUser();
  const ins = (path, status, age) => db.query(`insert into public.media (place_id, user_id, kind, mime, size_bytes, storage_path, status, created_at)
    values ($1, $2, 'photo', 'image/jpeg', 100, $3, $4, now() - $5::interval)`, [place.id, u, path, status, age]);
  const old = `${u}/old.jpg`, fresh = `${u}/fresh.jpg`, live = `${u}/live.jpg`, orphan = `${u}/orphan.jpg`;
  await ins(old, "pending", "2 hours");
  await ins(fresh, "pending", "5 minutes");
  await ins(live, "visible", "2 hours");
  await db.query("insert into storage.objects (bucket_id, name, metadata, created_at) values ('media', $1, '{}', now() - interval '2 hours')", [orphan]);
  await db.query("insert into storage.objects (bucket_id, name, metadata, created_at) values ('media', $1, '{}', now() - interval '2 hours')", [live]);
  const list = (await db.query("select * from public.media_cleanup_candidates(1000)")).rows.filter((r) => r.path.startsWith(u));
  assert.deepEqual(list.map((r) => `${r.why}:${r.path}`).sort(), [`orphan:${orphan}`, `unfinished:${old}`]);
  assert.equal((await db.query("select public.media_cleanup_done($1, 2) n", [[old, orphan]])).rows[0].n, 1);
  assert.deepEqual((await db.query("select storage_path from public.media where user_id = $1 order by 1", [u])).rows.map((r) => r.storage_path), [fresh, live]);
}));

test("maintenance jobs are scheduled and not callable from the app", async () => {
  const jobs = (await db.query("select jobname from cron.job order by 1")).rows.map((r) => r.jobname);
  assert.deepEqual(jobs, ["crowdmap-bot-sweep", "crowdmap-maintenance"]);
  const grants = (await db.query(`select has_function_privilege('authenticated', 'public.maintenance()', 'execute') m,
    has_function_privilege('anon', 'public.media_cleanup_candidates(int)', 'execute') c`)).rows[0];
  assert.deepEqual(grants, { m: false, c: false });
});
