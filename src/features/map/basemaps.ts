// Map types (basemaps) and overlays. Street, Felt-style, Dark and 3D are free
// (OpenFreeMap, no key). Satellite, Terrain and Contours use MapTiler, which needs
// NEXT_PUBLIC_MAPTILER_KEY (a public, domain-restricted browser key).
import { publicEnv } from "@/lib/env";

export type BasemapId = "street" | "felt" | "dark" | "3d" | "satellite" | "terrain";
export type OverlayId = "crowd" | "alerts" | "saved" | "labels" | "buildings" | "contours" | "traffic";

export const BASEMAPS: { id: BasemapId; needsKey: boolean }[] = [
  { id: "street", needsKey: false },
  { id: "felt", needsKey: false },
  { id: "dark", needsKey: false },
  { id: "3d", needsKey: false },
  { id: "satellite", needsKey: true },
  { id: "terrain", needsKey: true },
];

export const OVERLAYS: { id: OverlayId; needsKey?: boolean; unavailable?: boolean }[] = [
  { id: "crowd" },
  { id: "alerts" },
  { id: "saved" },
  { id: "labels" },
  { id: "buildings" },
  { id: "contours", needsKey: true },
  { id: "traffic", unavailable: true },
];

export const DEFAULT_OVERLAYS: Record<OverlayId, boolean> = {
  crowd: true, alerts: true, saved: true, labels: true, buildings: true, contours: false, traffic: false,
};

export const mapTilerKey = () => publicEnv().mapTilerKey;

export function styleUrl(id: BasemapId): string {
  const key = mapTilerKey();
  switch (id) {
    case "felt": return "https://tiles.openfreemap.org/styles/positron";
    case "dark": return "https://tiles.openfreemap.org/styles/dark";
    case "satellite": return `https://api.maptiler.com/maps/hybrid/style.json?key=${key}`;
    case "terrain": return `https://api.maptiler.com/maps/outdoor-v2/style.json?key=${key}`;
    default: return "https://tiles.openfreemap.org/styles/liberty";
  }
}

export const terrainSourceUrl = () => `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${mapTilerKey()}`;
export const contoursSourceUrl = () => `https://api.maptiler.com/tiles/contours-v2/tiles.json?key=${mapTilerKey()}`;

/** Attribution for the providers each map type adds on top of OpenStreetMap. */
export const MAPTILER_ATTRIBUTION = '<a href="https://www.maptiler.com/copyright/" target="_blank" rel="noopener">MapTiler</a>';
