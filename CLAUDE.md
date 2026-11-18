@AGENTS.md

# CrowdMap: rules for Claude

Spec: `docs/SPEC.md`. One developer now builds and owns the whole project; the earlier
User 1 / User 2 split is history (folder names like `scripts/user1/`, `tests/user2/`
and migration numbers `1xxx` / `2xxx` are kept as they are).

## Git

- Work on a short-lived branch, open a PR, merge when checks pass. `main` deploys to
  production automatically.
- New migrations: next free number (`3xxx_name.sql` from now on). Never edit an
  applied migration; add a new one.

## Project

- Thresholds, radii, timings, model names and limits live in `src/lib/config.ts` or
  the feature's `config.ts`; the database enforces the security-relevant ones too.
- Sample data is flagged `is_sample = true` and is never mixed into real statistics.
- Every new table gets row-level security policies; writes go through
  security-definer functions that check the caller.
- Every user or admin action is written to the audit log, which is append-only.
- Validation runs in the browser and again on the server (shared zod schemas).
- Database tests: `npm run test:db` (real database, each test rolled back).
