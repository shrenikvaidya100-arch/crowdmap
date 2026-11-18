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
  },
} as const;

export type Language = (typeof config.languages)[number];
