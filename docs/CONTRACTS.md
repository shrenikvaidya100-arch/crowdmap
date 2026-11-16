# Contracts between User 1 and User 2

The only ways one user's code may use the other's data. Changing this file is a
shared change. Filled in during the shared foundation step.

| Provided by | Name | Used by | Purpose |
|---|---|---|---|
| shared | `log_event(...)` | both | Append an entry to the audit log |
| shared | `places` table | both | Place ids for media, comments, reports |
| user1 | `place_crowd_now` view | user2 | Show live level in admin and profile |
| user1 | `location_checks` view | user2 | Bot detection: impossible travel, not-present reports |
| user2 | `user_trust` view | user1 | Weight reports by account trust |
| user2 | `is_removed(user_id)` | user1 | Hide removed accounts' reports |
