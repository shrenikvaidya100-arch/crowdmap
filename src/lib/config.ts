// All thresholds, limits and external endpoints live here. Never hard-code them elsewhere.

export const config = {
  appName: "CrowdMap",
  languages: ["en", "hi"] as const,
  defaultLanguage: "en" as const,
  defaultCity: "indore",

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

  // Place card photos from the web when nobody has posted one (Wikipedia / Wikimedia Commons).
  webPhotos: {
    timeoutMs: 4000,
    wikiRadiusKm: 2,       // a matching Wikipedia article must be this close
    commonsRadiusM: 150,   // Commons photos must be taken this close to the place
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
    // Uber's universal link: opens the app (or m.uber.com) with the drop-off filled in. No key needed.
    uberUrl: (to: { lat: number; lng: number; name: string }, from?: { lat: number; lng: number } | null) => {
      const q = new URLSearchParams({ action: "setPickup" });
      if (from) { q.set("pickup[latitude]", String(from.lat)); q.set("pickup[longitude]", String(from.lng)); }
      else q.set("pickup", "my_location");
      q.set("dropoff[latitude]", String(to.lat)); q.set("dropoff[longitude]", String(to.lng)); q.set("dropoff[nickname]", to.name);
      return `https://m.uber.com/ul/?${q}`;
    },
  },
  crowd: {
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
