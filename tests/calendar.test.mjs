// Design step 14: forecast_calendar (one expected level per day).
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import pg from "pg";

const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL });
let place;
before(async () => {
  await db.connect();
  place = (await db.query("select id from public.places where name = 'Sarafa Bazaar'")).rows[0].id;
});
after(() => db.end());

test("calendar: 14 days from today (India), daytime level, quietest hour; anyone can read it", async () => {
  await db.query("begin");
  try {
    await db.query("set local role anon");
    const c = (await db.query("select public.forecast_calendar($1, 14) c", [place])).rows[0].c;
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
    assert.equal(c.from, today);
    assert.equal(c.days.length, 14);
    for (const d of c.days) {
      assert.ok(d.level >= 1 && d.level <= 5, JSON.stringify(d));
      assert.ok(d.quietest.hour >= 8 && d.quietest.hour <= 21);
      assert.ok(d.quietest.level <= d.level + 1e-9);
      assert.ok(Array.isArray(d.special));
    }
    assert.equal(c.days[13].date, new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(Date.now() + 13 * 86_400_000)));
    assert.equal((await db.query("select public.forecast_calendar($1, 500) c", [place])).rows[0].c.days.length, 31);
    assert.equal((await db.query("select public.forecast_calendar(gen_random_uuid()) c")).rows[0].c, null);
  } finally {
    await db.query("rollback");
  }
});
