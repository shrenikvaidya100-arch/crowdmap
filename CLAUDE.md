@AGENTS.md

# CrowdMap: rules for Claude

Spec: `docs/SPEC.md`. Two people build this project with the same Claude account:
**User 1** and **User 2**. These rules are mandatory.

## Who is talking

- A message like "User 1 entering chat" makes User 1 the active user. They stay active
  until "User 1 exiting chat" or "User 2 entering chat".
- If no one is active, or a message is ambiguous, ask "User 1 or User 2?" before
  changing any file. Never guess.
- When the active user changes, write it to `.active-user` (one line: `user1` or
  `user2`). That file is git-ignored and read by the commit guard.
- Start each reply that changes files with the tag `[User 1]` or `[User 2]`.

## Who may change what

- `OWNERSHIP` lists each user's paths. Edit only files owned by the active user.
- Never edit, move, reformat, rename or delete a file owned by the other user,
  even to fix a bug. Instead, describe the problem and leave a note in
  `docs/HANDOFF-NOTES.md` under the other user's heading.
- Shared files (anything not listed in `OWNERSHIP`: config, foundation schema,
  layout, package.json, i18n common strings) change only when both users have said
  yes in chat. Then commit with `ALLOW_SHARED=1` and `[shared]` in the message.
- Database migrations: User 1 numbers them `1xxx_name.sql`, User 2 `2xxx_name.sql`,
  shared foundation `0xxx_name.sql`. A user's migration never alters the other
  user's tables.
- One user's features may *read* the other's tables only through the views and
  functions listed in `docs/CONTRACTS.md`. Changing a contract is a shared change.

## Git

- User 1 works on branches `user1/<topic>`, User 2 on `user2/<topic>`. Never commit
  to the other user's branch. `main` only changes by merging a reviewed branch.
- Commit messages start with `[user1]`, `[user2]` or `[shared]`.
- The pre-commit hook (`scripts/check-ownership.sh`) blocks commits that touch the
  other user's paths. Never bypass it with `--no-verify`.

## Project

- Thresholds, radii, timings, model names and limits live in `src/lib/config.ts`.
- Sample data is flagged `is_sample = true` and is never mixed into real statistics.
- Every new table gets row-level security policies.
- Every user or admin action is written to the audit log, which is append-only.
