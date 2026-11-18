// Makes an existing account an admin (or back to a normal user).
// Admins are only ever created here, never from the website; the database
// allows at most 2. The change is written to the audit log as a system action.
//
//   node --env-file=.env.local scripts/user2/make-admin.mjs someone@example.com
//   node --env-file=.env.local scripts/user2/make-admin.mjs someone@example.com --remove
//   node --env-file=.env.local scripts/user2/make-admin.mjs --list
import pg from "pg";

const [arg, flag] = process.argv.slice(2);
if (!arg) {
  console.error("Usage: make-admin.mjs <email> [--remove] | --list");
  process.exit(1);
}
const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL });
await db.connect();
try {
  if (arg === "--list") {
    const { rows } = await db.query(`select p.display_name, u.email, p.status from public.profiles p
                                     join auth.users u on u.id = p.id where p.role = 'admin' order by p.created_at`);
    console.table(rows);
  } else {
    const role = flag === "--remove" ? "user" : "admin";
    const { rows } = await db.query(`update public.profiles p set role = $2 from auth.users u
                                     where u.id = p.id and lower(u.email) = lower($1) returning p.display_name`, [arg, role]);
    if (!rows.length) {
      console.error(`No account with that email. Sign up on the site first, then run this again.`);
      process.exitCode = 1;
    } else {
      console.log(`${rows[0].display_name} is now ${role === "admin" ? "an admin" : "a normal user"}.`);
    }
  }
} catch (err) {
  console.error(/admin/i.test(err.message) ? `Refused: ${err.message}` : err.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
