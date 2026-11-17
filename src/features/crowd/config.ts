// User 1 crowd settings. The database enforces the security-relevant ones too
// (supabase/migrations/1001_crowd_reports.sql); keep both in sync.

export const crowdConfig = {
  gps: {
    samples: 3,             // readings taken before reporting
    sampleWindowMs: 6000,   // how long to collect them
    maxAccuracyM: 75,       // reject fixes worse than this (DB enforces)
    maxSpreadM: 100,        // readings must agree within this (DB enforces)
  },
  reportCooldownMin: 10,    // one crowd report per place per 10 min (DB enforces)
  reportEditableMin: 15,    // a report can be corrected for 15 min (DB enforces)
  refreshMs: 60_000,        // map polls for new levels every minute
} as const;

export const QUICK_KINDS = [
  { kind: "long_queue", icon: "⏳" },
  { kind: "police", icon: "👮" },
  { kind: "road_blocked", icon: "🚧" },
  { kind: "waterlogging", icon: "🌊" },
  { kind: "accident", icon: "💥" },
  { kind: "parking_full", icon: "🅿️" },
  { kind: "closed", icon: "⛔" },
  { kind: "procession", icon: "🎉" },
  { kind: "construction", icon: "🏗️" },
  { kind: "power_cut", icon: "🔌" },
  { kind: "festival_rush", icon: "🪔" },
  { kind: "no_wait", icon: "✅" },
] as const;

export type QuickKind = (typeof QUICK_KINDS)[number]["kind"];
export const quickIcon = (kind: string) => QUICK_KINDS.find((k) => k.kind === kind)?.icon ?? "⚠️";

export const CATEGORY_ICON: Record<string, string> = {
  temple: "🛕", religious: "🕌", market: "🛍️", restaurant: "🍽️", cafe: "☕", street_food: "🥘",
  mall: "🏬", park: "🌳", tourist: "📸", hospital: "🏥", station: "🚉", bank: "🏦",
  government: "🏛️", education: "🎓", entertainment: "🎬", other: "📍",
};
