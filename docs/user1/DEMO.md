# Demo-day checklist (User 1)

## 10–30 minutes before presenting

1. Refresh sample live data (it counts as live for 90 minutes):

   ```bash
   export PATH="$HOME/.local/node/bin:$PATH"
   cd /Users/shrenik/crowdmap
   node --env-file=.env.local scripts/user1/demo-data.mjs indore
   ```

   Use `all` for every city. Sample places show a **Sample** label, never "Live".

2. Open https://crowdmap-kappa.vercel.app on the phone and the laptop once, so the map is cached.

## After presenting

```bash
node --env-file=.env.local scripts/user1/demo-data.mjs --clear
```

## What sample data is and isn't

- Rows have `is_sample = true` in `crowd_reports` and `quick_reports`.
- They are labelled "Sample" on the map, in the place panel and in alerts.
- They are excluded from forecast history (`forecast_day` ignores sample reports), so they never change real predictions.
- Generating or clearing them is written to the audit log (`system.demo_data`, `system.demo_data_clear`).

## Demo flow that shows each User 1 feature

| Feature | What to show |
|---|---|
| Live map | Indore: solid dots (sample live) vs faded (estimated) |
| Search | Type "gatway" → Gateway of India (Mumbai), map switches city |
| Filters + list | Filters → Food + "Quiet or emptier" → List, sorted nearest |
| Place panel | Tap a sample place: level, Sample label, alerts with votes |
| Plan my visit | Tomorrow → best time, tap 8 pm, "I'm planning to go" |
| Report (needs GPS) | On the phone at a real place: tap a crowd level |
| Instant updates | Report on the phone; the laptop map changes in ~2 s |
| Add a place | ＋ Add place → GPS → name + type (account must be 24 h old) |
| Presence | 📡 on the phone → laptop shows a blue halo at that place |
