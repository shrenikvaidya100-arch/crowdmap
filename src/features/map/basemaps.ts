// Map types (basemaps) and overlays. Street, Felt-style, Dark and 3D are free
// (OpenFreeMap, no key). Satellite uses MapTiler when NEXT_PUBLIC_MAPTILER_KEY is
// set, otherwise Esri World Imagery (free, no key, with attribution). Terrain
// and Contours need the MapTiler key.
import type { StyleSpecification } from "maplibre-gl";
import { publicEnv } from "@/lib/env";

export type BasemapId = "street" | "felt" | "dark" | "3d" | "satellite" | "terrain";
export type OverlayId = "crowd" | "alerts" | "saved" | "labels" | "buildings" | "contours" | "traffic";

export const BASEMAPS: { id: BasemapId; needsKey: boolean }[] = [
  { id: "street", needsKey: false },
  { id: "felt", needsKey: false },
  { id: "dark", needsKey: false },
  { id: "3d", needsKey: false },
  { id: "satellite", needsKey: false },
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

const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";
/** Satellite photos with place names on top, without any key. */
const ESRI_SATELLITE: StyleSpecification = {
  version: 8,
  // Same glyphs as the other styles, so our labels keep working.
  glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
  sources: {
    imagery: { type: "raster", tileSize: 256, maxzoom: 19, tiles: [`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`],
      attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics" },
    names: { type: "raster", tileSize: 256, maxzoom: 19, tiles: [`${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`] },
  },
  layers: [
    { id: "imagery", type: "raster", source: "imagery" },
    { id: "names", type: "raster", source: "names" },
  ],
};

export function styleUrl(id: BasemapId): string | StyleSpecification {
  const key = mapTilerKey();
  if (id === "satellite" && !key) return ESRI_SATELLITE;
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
