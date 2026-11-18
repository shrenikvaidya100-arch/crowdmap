# Admin area (User 2)

`/admin` is visible only to active admins; everyone else gets "not found".

## Appointing the 2 admins (once, at setup)

Each person signs up on the site first, then the owner runs, on their own laptop:

```bash
node --env-file=.env.local scripts/user2/make-admin.mjs their-email@example.com
node --env-file=.env.local scripts/user2/make-admin.mjs --list
```

The database refuses a third admin. `--remove` turns an admin back into a normal user.
There is deliberately no way to do this from the website.

## What admins can do

- **Overview**: counts, recent admin/system actions, accounts with the most GPS rejections.
- **Users**: search by name, email or id; filter by status; sort by newest, activity, contributions or
  GPS rejections. **Remove** hides the account and everything it posted (reports, alerts, uploads,
  comments) at once; **Restore** brings it all back. Admins can't be removed here, and nobody can remove themselves.
- **Content**: uploads and comments, including hidden ones, with search and status filter. **Hide** /
  **Show again** one item; files are kept so nothing is lost.
- **Bots**: the database checks recently active accounts every 10 minutes. 100+ points removes the account
  automatically; 40–99 flags it and lowers its trust. Each finding lists its evidence. **Restore** an account
  removed by mistake (old evidence is then ignored), **Mark reviewed**, or **False alarm** (trust back to normal).
  **Run the check now** runs it on demand. The rules table shows every signal, window, threshold and points.
- **Audit log**: filter by action prefix, person, target, role and dates; page through history;
  **Verify the whole chain** re-checks every entry's hash (and logs that it was checked).

Every change needs a reason, and the reason is written to the audit log.
