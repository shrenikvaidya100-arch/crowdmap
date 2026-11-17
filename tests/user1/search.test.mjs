// User 1: place search (database function search_places).
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import pg from "pg";

const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL });
before(() => db.connect());
after(() => db.end());

async function search(q, city = null, limit = 8) {
  await db.query("begin");
  try {
    await db.query("set local role anon"); // works for signed-out visitors
    return (await db.query("select public.search_places($1, $2, $3) as r", [q, city, limit])).rows[0].r;
  } finally {
    await db.query("rollback");
  }
}
const names = (r) => r.map((x) => x.name);

test("finds famous places by name, across cities", async () => {
  assert.ok(names(await search("india gate", "indore")).includes("India Gate"));
  assert.ok(names(await search("sarafa", "indore")).includes("Sarafa Bazaar"));
});

test("tolerates typos", async () => {
  assert.ok(names(await search("gatway", "mumbai")).includes("Gateway of India"));
  assert.ok(names(await search("khajrna", "indore")).some((n) => /Khajrana Ganesh Mandir/.test(n)));
});

test("results carry a crowd level and city", async () => {
  const r = await search("temple", "delhi");
  assert.ok(r.length > 0);
  for (const x of r) {
    assert.ok(x.level >= 1 && x.level <= 5);
    assert.ok(["indore", "delhi", "mumbai"].includes(x.city_id));
  }
});

test("too short, too long and wildcard-only queries return nothing", async () => {
  assert.deepEqual(await search("a"), []);
  assert.deepEqual(await search("x".repeat(61)), []);
  assert.deepEqual(await search("%%"), []);
});

test("limit is capped at 20", async () => {
  assert.ok((await search("mandir", null, 500)).length <= 20);
});
