// Map types (basemaps) and overlays. Street, Felt-style, 3D and Terrain are free
// (OpenFreeMap, no key). Terrain adds real elevation from the free AWS Terrarium
// tiles (no key): hills and mountains rise in 3D with hill shading. Satellite is
// Esri World Imagery (free, no key). Only Contours needs the MapTiler key.
// Dark isn't listed as a map type: the day/night button in Customize covers it.
import type { StyleSpecification } from "maplibre-gl";
import { publicEnv } from "@/lib/env";

export type BasemapId = "street" | "felt" | "dark" | "3d" | "satellite" | "terrain";
export type OverlayId = "crowd" | "alerts" | "saved" | "labels" | "buildings" | "contours" | "traffic";

export const BASEMAPS: { id: BasemapId; needsKey: boolean }[] = [
  { id: "street", needsKey: false },
  { id: "felt", needsKey: false },
  { id: "3d", needsKey: false },
  { id: "terrain", needsKey: false },
  { id: "satellite", needsKey: false },
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
  if (id === "satellite") return ESRI_SATELLITE;
  switch (id) {
    case "felt": return "https://tiles.openfreemap.org/styles/positron";
    case "dark": return "https://tiles.openfreemap.org/styles/dark";
    default: return "https://tiles.openfreemap.org/styles/liberty";
  }
}

/** Free elevation tiles (Mapzen Terrarium on AWS Open Data), no key, CORS open. */
export const TERRAIN_DEM = {
  type: "raster-dem" as const,
  tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
  encoding: "terrarium" as const,
  tileSize: 256,
  maxzoom: 15,
  attribution: "Elevation: Mapzen Terrarium (AWS Open Data)",
};
export const contoursSourceUrl = () => `https://api.maptiler.com/tiles/contours-v2/tiles.json?key=${mapTilerKey()}`;

/** Attribution for the providers each map type adds on top of OpenStreetMap. */
export const MAPTILER_ATTRIBUTION = '<a href="https://www.maptiler.com/copyright/" target="_blank" rel="noopener">MapTiler</a>';
