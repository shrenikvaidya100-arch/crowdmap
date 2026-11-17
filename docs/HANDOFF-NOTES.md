# Notes between User 1 and User 2

Leave a note here instead of editing the other person's files.

## For User 1

## For User 2

From User 1 (2026-11-17), crowd reports milestone (`supabase/migrations/1001_crowd_reports.sql`):

- **`location_checks`** (contract): one row per GPS-checked action, accepted or not.
  Columns: `user_id, at, lat, lng, accuracy_m, spread_m, place_id, distance_m, speed_kmh, source, accepted, reason`.
  `reason` is one of `low_accuracy, unstable_location, not_at_place, impossible_travel, rate_limited, unknown_place, bad_location`.
  Admins can read all rows (RLS). Good input for bot detection: many rejections, `impossible_travel`, bursts.
- **`place_crowd_now`** (contract): view with `place_id, city_id, level (1-5), source ('live'|'estimated'), reports, last_report_at`. Readable by signed-in users.
- **My activity** can list the user's own rows from `crowd_reports` (`id, place_id, level, created_at`) and `quick_reports`. RLS already limits them to the owner. Edit: `crowd_reports.level` within 15 min; delete: any time. Both are audited by triggers.
- Audit actions used: `crowd.report`, `crowd.report_rejected`, `crowd.report_update`, `crowd.report_delete`, `quick.report`, `quick.report_rejected`, `quick.confirm`, `quick.vote`, `quick.delete`, `system.places_import`.
- Until `user_trust` / `is_removed` exist, crowd levels weight reports by `profiles.trust_score` and skip profiles whose `status` is not `active`. Removing a bot (status `removed`) hides its reports immediately.

Shared follow-up (needs both of us): `src/app/page.tsx` still loads `places` for `MapView`, which now ignores them and loads per city from `/api/crowd`. The query can be dropped from the page.

From User 1 (2026-11-17), please confirm: cities changed to **Indore, Delhi, Mumbai** (migration `1002`).
Pondicherry, Vadodara and Chennai were removed with their imported places (no reports existed).
Shared files touched for this: `docs/SPEC.md` (section 2), `tests/foundation.test.mjs` (city list),
`package.json` (`test:db` now runs test files one at a time: the audit-log TRUNCATE test deadlocks
with other files' audit inserts when they run in parallel).

From User 1 (2026-11-18), plan my visit (migrations `1005`, `1006`):
- **`visit_plans`** (`id, user_id, place_id, planned_for, created_at`): a user's "I'm planning to go" entries.
  RLS limits rows to the owner; owners can delete (audited as `plan.cancel`). `public.my_upcoming_plans()`
  returns the caller's upcoming plans with place names, ready for **My activity**.
- `planned_for` is always a whole hour in India time (stored as timestamptz, so it is :30 in UTC).
- **`special_days`** (holidays/festivals): fixed-date ones are seeded. Lunar festivals (Diwali, Holi, Eid,
  Ganesh Chaturthi, Navratri...) need their dates added each year; an admin screen for this would fit the admin area.
- Audit actions: `plan.create`, `plan.cancel`.

From User 1 (2026-11-18), add a missing place (migration `1007`):
- Users add places via `add_place()`; they start as `places.status = 'unconfirmed'` with `added_by` set.
  Two other people at the spot confirming (`place_confirmations.exists_here`) makes them `listed`;
  2+ "doesn't exist" votes outnumbering confirmations set `removed`.
- Rules in the database: account older than 24 h, active, GPS at the spot, inside a launch city,
  no similar name within 50 m, 3 new places per user per day.
- Audit actions: `place.add`, `place.add_rejected`, `place.confirm`, `place.edit`, `place.delete`,
  `system.place_listed`, `system.place_removed`. Good bot signals: many `place.add_rejected`, many removed places by one user.
- `location_checks.source` now also has `add_place` and `confirm_place`.
- **My activity** could list `places where added_by = auth.uid()` (readable: places are public unless removed).

From User 1 (2026-11-18), live presence and instant updates (migration `1008`):
- **`presence`**: one row per user sharing their location (latest position only, counted for 10 min,
  deleted after 1 h). Readable by the user and admins only. **`presence_hourly`**: public peak counts per place per hour.
- Presence only ever *raises* a place's live level (many users at once can't be "empty"); it never lowers it.
- Teleporting heartbeats are refused and logged in `location_checks` with `source = 'presence'`.
- **Realtime**: the database broadcasts `{place_id, kind}` on channel `crowd:<city_id>` (event `changed`) whenever
  reports, alerts, places or presence change. Anyone viewing can subscribe with the publishable key.
  If an admin action should refresh maps instantly (e.g. removing a bot's reports), changing those rows already triggers it.
- `live_level()` now also returns `here`; `place_crowd_now` has a `here` column.
