# CrowdMap: product spec (draft 1)

Working name. A live crowd map for places, not roads: before you leave, see whether
the temple, market, restaurant or mall is empty or packed, and when it will be quiet.

Status: all decisions below are agreed by User 1 and User 2 (2026-11-17).

---

## 1. Ground rules

- **Free to run.** Every service is on a free tier with no credit card.
- **Works everywhere.** One public HTTPS link, usable on phone, laptop and the
  classroom PC. Installable on phones as an app (PWA).
- **Crowd only.** Users never rate food, service or quality. Places get exactly one
  user-facing rating: how crowded they are right now.
- **Languages.** English first, Hindi second, built so more can be added.

## 2. Cities

| Order | City | Notes |
|---|---|---|
| 1 | Indore | Primary demo city. Full sample data. |
| 2 | Pondicherry | Sample data |
| 3 | Vadodara | Sample data |
| 4 | Chennai | Sample data |
| 5 | Delhi | Sample data |

The map itself covers the whole world (OpenStreetMap). The cities above are where we
pre-load places and sample crowd data.

## 3. Where places come from

1. **Imported from OpenStreetMap** (Overpass API) for each city: temples, markets,
   restaurants, malls, parks, tourist spots, hospitals, stations, food streets.
2. **Added by users, no admin approval,** if every check passes:
   - The user is physically at the spot (GPS check, section 5).
   - Name, category and pin are valid; no duplicate within 50 m with a similar name.
   - Account is past its probation period and in good standing.
   - The place stays "unconfirmed" until 2 other users, each physically present,
     confirm it. Then it is fully listed. Fake places get removed by the bot rules.
   - Optional: an "Also add to OpenStreetMap" link that opens the OSM editor at
     that spot. We do not write to OSM ourselves.

## 4. Crowd scale

| Level | Label | Colour |
|---|---|---|
| 1 | Empty | Green |
| 2 | Quiet | Green |
| 3 | Moderate | Yellow |
| 4 | Busy | Orange |
| 5 | Packed | Red |

Each place shows a level, how fresh it is, and a confidence badge:

- **Live**: recent reports or check-ins from people present.
- **Estimated**: no recent reports; based on patterns and forecasts (section 6).
- **No data.**

## 5. Proving a user is really there

A browser cannot give perfect proof of location; GPS can be faked with developer
tools or spoofing apps. We stack checks so that faking is hard and gets caught:

- High-accuracy GPS required; readings with accuracy worse than ~50 m are rejected.
- The user must be inside the place's radius (default 150 m, per category).
- Several readings a few seconds apart must agree (spoofers often send one fixed point).
- Speed check against the user's previous readings (no "teleporting").
- Media evidence (photo, video, audio) must be captured live in the app with the
  camera or mic, not picked from the gallery.
- Server re-checks everything; the browser is never trusted.

## 6. How the crowd level is calculated

Signals, strongest first:

1. **Crowd reports**: one tap on the 5-level scale by someone present.
2. **Live presence**, like Google Maps: users who opt in share their location
   quietly about once a minute while the site (or installed app) is open. A browser
   cannot do this with the site closed. Counts only *our* users. Raw locations are
   kept briefly; only per-place counts are stored long term.
3. **Quick-report buttons** (section 7). Some raise the level (e.g. "Long queue").
4. **Intent**: people who searched for, viewed or marked "planning to go" for a place
   at a time. Used for forecasts, not the live level. Shown publicly as counts,
   e.g. "34 people plan to visit after 6 pm" (never who).
5. **Patterns**: the same place's history by hour and weekday.
6. **Context**: category defaults, Indian festival/holiday calendar, weather
   (Open-Meteo, free), known local events. An AI model drafts sensible default
   patterns per place type so no place starts blank. Anything built only from
   signals 4 to 6 is always labelled **Estimated**.

Every signal fades over time (reports count fully for ~15 min, mostly gone by 90 min).
Reports from trusted accounts weigh more than new accounts.

Outputs per place:
- **Now**: level + confidence.
- **Best time to visit**: an hour-by-weekday chart and "quietest in the next 6 hours".
- **Forecast**: expected level at a time the user picks.

## 7. Quick-report buttons

One tap, like a traffic-alert app, but about places and their surroundings:

Long queue · Police / barricade · Road blocked · Waterlogging / flooding ·
Accident · Parking full · Closed right now · Procession / event ·
Construction · Power cut · Festival rush · Free seating / no wait

Each expires after a set time unless others confirm it. Others can tap
"Still there" or "Gone".

## 8. Users

- **Sign up and login:** Google sign-in, or email + password. CAPTCHA
  (Cloudflare Turnstile) on both sign-up and login. Mandatory.
- **Map:** live colours, search with suggestions, filters (category, level,
  distance, open now), sorting, "near me".
- **Place page:** live level, best-time chart, forecast, active quick reports,
  media feed, comments.
- **Contribute:** crowd report, quick report, upload photo / video / audio,
  comment on others' media, add a missing place.
- **My activity:** everything I reported, uploaded or commented on, with edit and
  delete. Saved places, and alerts like "tell me when this place goes green".
- **Personal:** nearby places first, my city remembered, my language.

## 9. Admins and safety

- **Exactly 2 admins**, created once at setup. No way to become admin from the website.
- **Admin dashboard:** users, reports, media, comments, flagged items, statistics,
  search/filter/sort on every table.
- **Bot detection runs automatically.** Signals:
  - Impossible travel: two location-checked actions too far apart for the time between them.
  - Too many actions per hour, or bursts across many places.
  - Reports for places the user is not at.
  - Copy-pasted or nonsense text; duplicate media.
  - New account with heavy activity.
- **Bots are removed automatically, no admin approval.** The removal is written to
  the log, and an admin can restore the account and its content if it was a mistake.
  Removed content is hidden from everyone but kept so it can be restored.
- **AI moderation** (free AI API) screens comments and media captions for abuse.
- **Audit log:** every action by every user and admin is appended. The database
  itself refuses edits and deletes, for everyone, admins included. Each entry is
  chained to the previous one by a hash, so tampering would be visible.

## 10. Security

- HTTPS everywhere (automatic on the host).
- Row-level security in the database: users can only change their own rows.
- Validation in the browser and again on the server for every form.
- Rate limits on every write.
- Uploads: type and size checked, images stripped of hidden location metadata,
  videos capped at 30 s / 25 MB and compressed in the browser before upload.
- Secrets only in server environment variables, never in the browser.

## 11. Free stack

| Need | Choice |
|---|---|
| Web app | Next.js (TypeScript), Tailwind |
| Hosting + HTTPS | Vercel (free Hobby plan) |
| Database, login, file storage, live updates | Supabase (free): Postgres + PostGIS, Auth, Storage, Realtime |
| Map | MapLibre GL + OpenFreeMap tiles (OpenStreetMap data, free, no key) |
| Place search | Photon / Nominatim (OpenStreetMap) + our own place table |
| Place import | Overpass API |
| CAPTCHA | Cloudflare Turnstile |
| Weather | Open-Meteo |
| AI (moderation, translation, summaries) | Free tier of Google AI Studio or Groq |
| Scheduled jobs (keep database awake, recompute patterns, bot sweeps) | GitHub Actions |
| Translations | next-intl, English + Hindi |

Known free-tier limits: database 500 MB, file storage 1 GB, Supabase pauses after a
week without traffic (the scheduled job prevents this).

## 12. Team setup

- Name: **CrowdMap**.
- Two laptops, one permanent identity each. The laptop where this repo was first
  set up is **User 1**; the other is **User 2** (`.active-user` on each machine).
- One shared Claude Pro account; usage limit is shared, accepted.

## 13. Open questions

None right now.
