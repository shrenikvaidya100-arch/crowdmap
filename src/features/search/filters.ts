// Filtering and sorting for the map and the list. Pure functions with no
// imports, so tests can run them directly (tests/user1/filters.test.mjs).

export type FilterablePlace = {
  id: string; name: string; name_hi: string | null; category: string;
  lat: number; lng: number; level: number; source: "live" | "estimated"; sample?: boolean;
};

export type SortKey = "quietest" | "busiest" | "nearest" | "name";

export type Filters = {
  groups: string[];          // empty = every group
  maxLevel: 1 | 2 | 3 | 4 | 5; // 5 = any level
  radiusKm: number | null;   // null = any distance
  liveOnly: boolean;
  sort: SortKey;
};

export const DEFAULT_FILTERS: Filters = { groups: [], maxLevel: 5, radiusKm: null, liveOnly: false, sort: "quietest" };

/** Category groups shown as filter chips. */
export const GROUPS: { key: string; icon: string; categories: string[] }[] = [
  { key: "worship", icon: "🛕", categories: ["temple", "religious"] },
  { key: "food", icon: "🍽️", categories: ["restaurant", "cafe", "street_food"] },
  { key: "shopping", icon: "🛍️", categories: ["market", "mall"] },
  { key: "parks", icon: "🌳", categories: ["park"] },
  { key: "sights", icon: "📸", categories: ["tourist", "entertainment"] },
  { key: "health", icon: "🏥", categories: ["hospital"] },
  { key: "transport", icon: "🚉", categories: ["station"] },
  { key: "services", icon: "🏦", categories: ["bank", "government", "education", "other"] },
];

export const RADII_KM = [1, 3, 5, 10] as const;

/** Great-circle distance in kilometres. */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function countActive(f: Filters) {
  return (f.groups.length ? 1 : 0) + (f.maxLevel < 5 ? 1 : 0) + (f.radiusKm !== null ? 1 : 0) + (f.liveOnly ? 1 : 0);
}

/**
 * Applies filters and sorting. `origin` is the user's location, or the map
 * centre when location is unknown; distances are measured from it.
 */
export function applyFilters<T extends FilterablePlace>(
  places: T[], f: Filters, origin: { lat: number; lng: number } | null,
): (T & { distanceKm: number | null })[] {
  const allowed = f.groups.length
    ? new Set(GROUPS.filter((g) => f.groups.includes(g.key)).flatMap((g) => g.categories))
    : null;

  const out = [];
  for (const p of places) {
    if (allowed && !allowed.has(p.category)) continue;
    if (p.level > f.maxLevel) continue;
    if (f.liveOnly && p.source !== "live") continue;
    const d = origin ? distanceKm(origin, p) : null;
    if (f.radiusKm !== null && (d === null || d > f.radiusKm)) continue;
    out.push({ ...p, distanceKm: d });
  }

  const byName = (a: T, b: T) => a.name.localeCompare(b.name, "en", { sensitivity: "base" });
  const byDistance = (a: { distanceKm: number | null }, b: { distanceKm: number | null }) =>
    (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity);
  out.sort((a, b) => {
    switch (f.sort) {
      case "quietest": return a.level - b.level || byDistance(a, b) || byName(a, b);
      case "busiest": return b.level - a.level || byDistance(a, b) || byName(a, b);
      case "nearest": return byDistance(a, b) || byName(a, b);
      case "name": return byName(a, b);
    }
  });
  return out;
}
