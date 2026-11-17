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
