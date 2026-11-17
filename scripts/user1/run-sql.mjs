// Runs a SQL file against the Supabase database (SUPABASE_DB_URL).
//   node --env-file=.env.local scripts/user1/run-sql.mjs path/to/file.sql
import { readFileSync } from "node:fs";
import pg from "pg";

const file = process.argv[2];
if (!file) { console.error("usage: run-sql.mjs <file.sql>"); process.exit(1); }
const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL });
await db.connect();
try {
  const res = await db.query(readFileSync(file, "utf8"));
  for (const r of [res].flat()) console.log(r.command, r.rowCount ?? "");
} finally {
  await db.end();
}
