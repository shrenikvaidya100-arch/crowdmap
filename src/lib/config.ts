// All thresholds, limits and external endpoints live here. Never hard-code them elsewhere.

export const config = {
  appName: "CrowdMap",
  languages: ["en", "hi"] as const,
  defaultLanguage: "en" as const,
  defaultCity: "indore",
  // The public address (Contact page QR code). NEXT_PUBLIC_SITE_URL overrides it.
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || "https://crowdmap-kappa.vercel.app",

  map: {
    // OpenFreeMap: free OpenStreetMap vector tiles, no key, no usage limits.
    styleUrl: "https://tiles.openfreemap.org/styles/liberty",
    worldCenter: [78.9629, 22.5937] as [number, number], // India
    worldZoom: 4.2,
  },

  auth: {
    passwordMinLength: 8,
    passwordMaxLength: 72, // bcrypt limit used by Supabase Auth
    displayNameMin: 2,
    displayNameMax: 32,
  },

  captcha: {
    scriptUrl: "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",
    verifyUrl: "https://challenges.cloudflare.com/turnstile/v0/siteverify",
  },

  // Search: map points (shops, streets, landmarks…) from Photon (OpenStreetMap, free,
  // no key), fetched through our own server so visitors' IPs aren't shared.
  geocoder: {
    url: (q: string, lat: number, lng: number, lang: string) =>
      `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&lat=${lat}&lon=${lng}&limit=8&lang=${lang === "hi" ? "default" : "en"}`,
    timeoutMs: 3500,
    maxResults: 5,
    recentSearches: 6,     // kept in the browser for suggestions
  },
  // Place card photos from the web when nobody has posted one (Wikipedia / Wikimedia Commons).
  webPhotos: {
    timeoutMs: 4000,
    wikiRadiusKm: 2,       // a matching Wikipedia article must be this close
    commonsRadiusM: 150,   // Commons photos must be taken this close to the place
  },
  // Extra check before the admin area: type the code shown in a distorted image.
  adminGate: {
    codeLength: 6,
    alphabet: "ABCDEFGHJKMNPQRSTUVWXYZ23456789", // no 0/O, 1/I/L look-alikes
    codeTtlSec: 300,       // a code must be typed within 5 minutes
    unlockMinutes: 30,     // then the admin area stays open this long
  },
  // Directions drawn on the map (FOSSGIS OSRM servers: free, no key, fair use) and
  // hand-offs to other apps for turn-by-turn and rides.
  routing: {
    routeUrl: (mode: "drive" | "walk", from: [number, number], to: [number, number]) =>
      `https://routing.openstreetmap.de/${mode === "walk" ? "routed-foot" : "routed-car"}/route/v1/driving/${from[0]},${from[1]};${to[0]},${to[1]}?overview=full&geometries=geojson`,
    timeoutMs: 10000,
    walkUpToM: 1500,      // closer than this, directions start in walking mode
    arrivedM: 40,         // "You've arrived" within this distance
    googleUrl: (lat: number, lng: number, mode: "drive" | "walk") =>
      `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=${mode === "walk" ? "walking" : "driving"}`,
    // Uber's web link (developer.uber.com "deep-linking-standard"): pickup and drop-off as JSON,
    // so m.uber.com opens with both filled in (and the app, where it takes the link). No key needed.
    uberUrl: (to: { lat: number; lng: number; name: string }, from?: { lat: number; lng: number } | null) => {
      const spot = (lat: number, lng: number, name: string) =>
        JSON.stringify({ latitude: Number(lat.toFixed(6)), longitude: Number(lng.toFixed(6)), addressLine1: name });
      const q = new URLSearchParams();
      if (from) q.set("pickup", spot(from.lat, from.lng, "Your location"));
      q.set("drop[0]", spot(to.lat, to.lng, to.name));
      return `https://m.uber.com/looking?${q}`;
    },
  },
  crowd: {
    // A report goes live only once a second person agrees (see migration 3013).
    // People within this distance of a place with a waiting report are asked to confirm.
    confirmRadiusM: 400,
    confirmCheckMs: 20_000,  // backup check; live city updates trigger one straight away
    // 5-level scale. Colour per level; level 0 = no data.
    levels: [
      { level: 1, key: "empty", color: "#16a34a" },
      { level: 2, key: "quiet", color: "#65a30d" },
      { level: 3, key: "moderate", color: "#eab308" },
      { level: 4, key: "busy", color: "#f97316" },
      { level: 5, key: "packed", color: "#dc2626" },
    ],
    noDataColor: "#9ca3af",
    // Crowd calendar: how many days ahead get a daily forecast.
    calendarDays: 14,
  },
} as const;

export type Language = (typeof config.languages)[number];
