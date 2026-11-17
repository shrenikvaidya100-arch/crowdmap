# CrowdMap

Live crowd levels for places. Spec: `docs/SPEC.md`. Rules for the two builders: `CLAUDE.md`.

## Status

| Part | State |
|---|---|
| Shared foundation: schema, login + sign-up with CAPTCHA, audit log, map shell, English/Hindi | Built |
| User 1: places import, crowd reports, colours, forecasts, search | Next |
| User 2: uploads, comments, My activity, admin, bot detection | Next |

## First-time setup on each laptop

```bash
npm install
git config core.hooksPath .githooks
echo user1 > .active-user        # or user2
cp .env.example .env.local       # then fill in the Supabase values
npm run dev                      # http://localhost:3000
```

## Database

Migrations live in `supabase/migrations`: `0xxx` shared, `1xxx` User 1, `2xxx` User 2.
Apply them to the Supabase project:

```bash
set -a; source .env.local; set +a; npm run db:push
```

### Making the two admins

After both admins have signed up once, run this in Supabase → SQL Editor (one email at a time):

```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'admin-email@example.com');
```

The database refuses a third admin, and every role change lands in the audit log.

## Free services

GitHub · Vercel (hosting + HTTPS) · Supabase (database, login, storage) ·
OpenFreeMap / OpenStreetMap (map) · Cloudflare Turnstile (CAPTCHA).
