// User 1: visit plans and the hourly forecast. Rolled back after each test.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import pg from "pg";

const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL });
let place;
before(async () => {
  await db.connect();
  place = (await db.query("select id, category from public.places where name = 'Sarafa Bazaar'")).rows[0];
});
after(() => db.end());

async function inTx(fn) {
  await db.query("begin");
  try { await fn(); } finally { await db.query("rollback"); }
}
async function newUser() {
  const id = randomUUID();
  await db.query(`insert into auth.users (id, email, aud, role, raw_user_meta_data)
                  values ($1, $2, 'authenticated', 'authenticated', '{"display_name":"Planner"}')`, [id, `${id}@test.invalid`]);
  return id;
}
async function actAs(id) {
  await db.query("reset role");
  await db.query("set local role authenticated");
  await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: id, role: "authenticated" })]);
}
const plan = async (at, p = place.id) => (await db.query("select public.plan_visit($1, $2) as r", [p, at])).rows[0].r;
const inHours = (h) => new Date(Date.now() + h * 3600_000).toISOString();
const forecast = async (date) => (await db.query("select public.forecast_day($1, $2) as f", [place.id, date])).rows[0].f;
const tomorrow = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(Date.now() + 86_400_000));

test("forecast has 24 hours with levels between 1 and 5", () => inTx(async () => {
  await db.query("set local role anon");
  const f = await forecast(tomorrow());
  assert.equal(f.hours.length, 24);
  assert.ok(f.hours.every((h, i) => h.hour === i && h.level >= 1 && h.level <= 5));
}));

test("plans: rounded to the hour, one per hour, audited, counted in the forecast", () => inTx(async () => {
  const u = await newUser();
  await actAs(u);
  const at = inHours(26.5);
  const r = await plan(at);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal((await plan(at)).reason, "already_planned");
  const row = (await db.query("select planned_for from public.visit_plans where id = $1", [r.id])).rows[0];
  assert.equal(row.planned_for.getUTCMinutes(), 30); // India hours start at :30 UTC
  await db.query("reset role");
  const log = await db.query("select action from public.audit_log where actor_id = $1 and action like 'plan.%'", [u]);
  assert.deepEqual(log.rows.map((x) => x.action), ["plan.create"]);
  const f = await forecast(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(at)));
  const slot = f.hours.find((h) => new Date(h.at).getTime() === row.planned_for.getTime());
  assert.equal(slot.plans, 1);
}));

test("many plans raise the forecast for that hour", () => inTx(async () => {
  const at = new Date(inHours(30));
  at.setUTCMinutes(30, 0, 0); // an India-time hour boundary
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(at);
  const before = (await forecast(date)).hours.find((h) => new Date(h.at).getTime() === at.getTime());
  const users = [];
  for (let i = 0; i < 15; i++) users.push(await newUser()); // create as owner first
  for (const u of users) {
    await actAs(u);
    assert.equal((await plan(at.toISOString())).ok, true);
  }
  await db.query("reset role");
  const after = (await forecast(date)).hours.find((h) => new Date(h.at).getTime() === at.getTime());
  assert.equal(after.plans, 15);
  assert.ok(after.level >= Math.min(5, before.level + 1.4), `${before.level} -> ${after.level}`);
}));

test("plans must be from now to 7 days ahead, max 10 upcoming", () => inTx(async () => {
  await actAs(await newUser());
  assert.equal((await plan(inHours(-3))).reason, "bad_time");
  assert.equal((await plan(inHours(24 * 8))).reason, "bad_time");
  for (let i = 1; i <= 10; i++) assert.equal((await plan(inHours(i * 2 + 1))).ok, true);
  assert.equal((await plan(inHours(40))).reason, "too_many_plans");
}));

test("only the owner can see and cancel a plan; cancelling is audited", () => inTx(async () => {
  const a = await newUser();
  const b = await newUser();
  await actAs(a);
  const id = (await plan(inHours(5))).id;
  await actAs(b);
  assert.equal((await db.query("select * from public.visit_plans where id = $1", [id])).rowCount, 0);
  assert.equal((await db.query("delete from public.visit_plans where id = $1", [id])).rowCount, 0);
  await actAs(a);
  assert.equal((await db.query("delete from public.visit_plans where id = $1", [id])).rowCount, 1);
  await db.query("reset role");
  const log = await db.query("select action from public.audit_log where actor_id = $1 and action like 'plan.%' order by id", [a]);
  assert.deepEqual(log.rows.map((x) => x.action), ["plan.create", "plan.cancel"]);
}));

test("special days change the forecast for matching places", () => inTx(async () => {
  const date = tomorrow();
  const plain = await forecast(date);
  await db.query("insert into public.special_days (day, name, categories, boost) values ($1, 'Test festival', $2, 1)",
    [date, [place.category]]);
  const festive = await forecast(date);
  assert.deepEqual(festive.special.map((s) => s.name), ["Test festival"]);
  const raised = festive.hours.filter((h, i) => h.level > plain.hours[i].level || h.level === 5);
  assert.equal(raised.length, 24);
}));

test("signed-out visitors can read forecasts but not plan", () => inTx(async () => {
  await db.query("set local role anon");
  await db.query("savepoint s");
  await assert.rejects(db.query("select public.plan_visit($1, now())", [place.id]), /permission denied/);
  await db.query("rollback to savepoint s");
  await assert.rejects(db.query("select * from public.visit_plans"), /permission denied/);
  await db.query("rollback to savepoint s");
}));
