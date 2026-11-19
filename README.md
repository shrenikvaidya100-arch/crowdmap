# CrowdMap

Live crowd levels for temples, markets, restaurants, hostels and more in 50+ Indian cities:
like a traffic map, but for how crowded a place is. IIM Indore's campus is mapped building by building. Spec: `docs/SPEC.md`.

**Live site:** https://crowdmap-kappa.vercel.app (deploys automatically from `main`)

## Features

- **Login and sign-up** with email or Google; Cloudflare Turnstile CAPTCHA on both, checked on the server.
- **Live map** (OpenStreetMap): 5-level crowd colours, live vs estimated, instant updates without refreshing.
- **Report** how crowded a place is and quick alerts (police, waterlogging, long queue…), only when GPS shows you're there.
- **Search, filters and a sortable list**; **plan my visit** with forecasts, best time, weather and holidays.
- **Add a missing place**, confirmed by two other people at the spot.
- **Photos, videos and audio** recorded live at the place, with comments.
- **My activity**: everything you've posted, with edit and delete; profile and language (English / हिन्दी).
- **Admin dashboard**: users, content moderation, audit log with tamper check, bot findings.
- **Automatic bot detection** every 10 minutes; removals are logged and can be undone by an admin.
- **Append-only audit log** of every action, hash-chained so tampering shows.
- **Privacy**: privacy policy and terms pages (accepted with a checkbox at sign-up); people can delete their own account from My activity.
- **Directions and rides**: route drawn on the map (drive or walk, follow along), Google Maps hand-off, and Uber with pickup and drop-off filled in.
- **Community page**: closest quiet place to you, city overview, community photos and posts.
- **Map types**: street, Felt-style, 3D buildings, Terrain (real hills and mountains, free elevation data) and satellite.
- **Admin check**: admins type a code from a distorted picture before the admin area opens.

## Demo (IIM Indore)

1. About 30 minutes before, add sample live readings (they count as live for 90 minutes and are labelled "Sample"):
   `node --env-file=.env.local scripts/user1/demo-data.mjs indore`. About half of the campus places get readings.
2. Open the map and search "IIM" (or tap the IIM Indore label): the campus card has photos, Directions and Uber.
3. Zoom into the campus: every hostel (SR 01–20), mess, block, café and court is its own dot; tap any of them.
4. Directions from your location, then Start; Uber opens with both points filled in.
5. `/community?city=indore`: closest quiet place, city overview, photos and posts.
6. Afterwards, remove the sample data: `node --env-file=.env.local scripts/user1/demo-data.mjs --clear`.

Course requirements: authentication + CAPTCHA (login, sign-up), client + server validation (shared zod
schemas, re-checked in the database), CRUD (reports, places, uploads, comments, plans, profile), and
structured data with search, filter and sort (map list, My activity, admin tables).

## Setup

```bash
npm install
cp .env.example .env.local       # then fill in the Supabase values
npm run dev                      # http://localhost:3000
```

## Database

Migrations live in `supabase/migrations`. Apply them to the Supabase project:

```bash
set -a; source .env.local; set +a; npm run db:push
```

Tests run against the real database, each in a transaction that is rolled back:

```bash
npm run test:db
```

### Scheduled jobs

| Job | Where | When |
|---|---|---|
| Bot detection (`bot_sweep`) | pg_cron in Supabase | every 10 minutes |
| Housekeeping (`maintenance`): stale presence, GPS checks older than 90 days | pg_cron in Supabase | hourly |
| File cleanup for unfinished or deleted uploads; keeps the free database awake | Vercel Cron → `/api/cron/daily` | daily, 3 am IST |

The Vercel job needs `CRON_SECRET` (any long random string) set in Vercel → Environment Variables,
Production. Without it the route refuses to run.

### Making the two admins

After someone has signed up, make them an admin (at most 2; every change is in the audit log):

```bash
node --env-file=.env.local scripts/user2/make-admin.mjs their-email@example.com
node --env-file=.env.local scripts/user2/make-admin.mjs --list
```

More in `docs/user2/ADMIN.md`. Demo data: `docs/user1/DEMO.md`.

## Free services

GitHub · Vercel (hosting + HTTPS) · Supabase (database, login, storage, scheduled jobs) ·
OpenFreeMap / OpenStreetMap (map) · Overpass (place import) · Open-Meteo (weather) ·
Cloudflare Turnstile (CAPTCHA).
