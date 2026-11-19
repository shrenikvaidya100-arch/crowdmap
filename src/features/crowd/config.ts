import type { IconName } from "@/components/icons/Icon";
// User 1 crowd settings. The database enforces the security-relevant ones too
// (supabase/migrations/1001_crowd_reports.sql); keep both in sync.

export const crowdConfig = {
  gps: {
    samples: 3,             // readings taken before reporting
    sampleWindowMs: 6000,   // how long to collect them
    maxAccuracyM: Infinity, // any fix counts (owner's choice); rough fixes just widen the match
    maxSpreadM: Infinity,
  },
  reportCooldownMin: 10,    // one crowd report per place per 10 min (DB enforces)
  reportEditableMin: 15,    // a report can be corrected for 15 min (DB enforces)
  refreshMs: 60_000,        // map polls for new levels every minute
} as const;

export const QUICK_KINDS = [
  { kind: "long_queue", icon: "long_queue" },
  { kind: "police", icon: "police" },
  { kind: "road_blocked", icon: "road_blocked" },
  { kind: "waterlogging", icon: "waterlogging" },
  { kind: "accident", icon: "accident" },
  { kind: "parking_full", icon: "parking_full" },
  { kind: "closed", icon: "closed" },
  { kind: "procession", icon: "procession" },
  { kind: "construction", icon: "construction" },
  { kind: "power_cut", icon: "power_cut" },
  { kind: "festival_rush", icon: "festival_rush" },
  { kind: "no_wait", icon: "no_wait" },
] as const satisfies readonly { kind: string; icon: IconName }[];

export type QuickKind = (typeof QUICK_KINDS)[number]["kind"];
export const quickIcon = (kind: string): IconName => QUICK_KINDS.find((k) => k.kind === kind)?.icon ?? "warning";

const CATEGORY_ICONS: Record<string, IconName> = {
  temple: "temple", religious: "religious", market: "market", restaurant: "restaurant", cafe: "cafe",
  street_food: "street_food", mall: "mall", park: "park", tourist: "tourist", hospital: "hospital",
  station: "station", bank: "bank", government: "government", education: "education",
  entertainment: "entertainment", hostel: "hostel", other: "pin",
};
/** Icon for a place category (falls back to a map pin). */
export const categoryIcon = (category: string | null | undefined): IconName => CATEGORY_ICONS[category ?? ""] ?? "pin";
