// Everything the map page changes on top of a basemap style: our crowd layers,
// overlays (labels, buildings, contours), 3D and terrain, label and marker size,
// overlay opacity, drawings and measurements. Called after every style load,
// because switching map type replaces the whole style.
import type { Map as MLMap, StyleSpecification } from "maplibre-gl";
import { contoursSourceUrl, MAPTILER_ATTRIBUTION, mapTilerKey, TERRAIN_DEM, type BasemapId, type OverlayId } from "./basemaps";

/** Our own sources and layers; carried over when the basemap changes. */
export const OWN_SOURCES = ["cm-route", "cm-cities", "places", "cm-shapes", "cm-measure"];
export const OWN_LAYERS = ["cm-route-casing", "cm-route-line", "cm-route-walk", "city-live", "city-bubbles", "presence", "places", "cm-shapes-fill", "cm-shapes-line", "cm-shapes-point", "cm-measure-line", "cm-measure-point"];

export type MapPrefs = {
  palette: "light" | "dark" | "sepia" | "contrast";
  labelScale: number;      // 0.8 – 1.6
  markerScale: number;     // 0.6 – 1.8 (crowd dots)
  crowdOpacity: number;    // 0.3 – 1
  contoursOpacity: number; // 0.2 – 1
  drawColor: string;       // new markers and shapes
  lineWidth: number;       // 1 – 8
};
export const DEFAULT_PREFS: MapPrefs = {
  palette: "light", labelScale: 1, markerScale: 1, crowdOpacity: 1, contoursOpacity: 0.6, drawColor: "#0894FF", lineWidth: 3,
};

/** Keeps our sources and layers when the next basemap style replaces the current one. */
export function carryOver(prev: StyleSpecification | undefined, next: StyleSpecification): StyleSpecification {
  if (!prev) return next;
  const sources = { ...next.sources };
  for (const id of OWN_SOURCES) if (prev.sources[id]) sources[id] = prev.sources[id];
  const own = prev.layers.filter((l) => OWN_LAYERS.includes(l.id));
  return { ...next, sources, layers: [...next.layers, ...own] };
}

const originalTextSize = new WeakMap<MLMap, Map<string, unknown>>();

/** Applies overlays and preferences to the current style. Safe to call repeatedly. */
export function applyOverlays(m: MLMap, basemap: BasemapId, overlays: Record<OverlayId, boolean>, prefs: MapPrefs) {
  const style = m.getStyle();
  if (!style) return;
  const sizes = originalTextSize.get(m) ?? new Map<string, unknown>();
  originalTextSize.set(m, sizes);

  for (const layer of style.layers) {
    if (OWN_LAYERS.includes(layer.id) || layer.id === "cm-contours") continue;
    const sourceLayer = (layer as { "source-layer"?: string })["source-layer"];
    if (layer.type === "symbol") {
      m.setLayoutProperty(layer.id, "visibility", overlays.labels ? "visible" : "none");
      // Label size: scale the style's own size (remember it per layer the first time).
      const key = `${basemap}:${layer.id}`;
      if (!sizes.has(key)) sizes.set(key, m.getLayoutProperty(layer.id, "text-size") ?? 16);
      const base = sizes.get(key);
      if (base !== undefined && m.getLayoutProperty(layer.id, "text-field") !== undefined) {
        const value = prefs.labelScale === 1 ? base : scaleSize(base, prefs.labelScale);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (value !== null) m.setLayoutProperty(layer.id, "text-size", value as any, { validate: false });
      }
    }
    if (sourceLayer === "building") {
      m.setLayoutProperty(layer.id, "visibility", overlays.buildings ? "visible" : "none");
    }
  }

  // Crowd dots and halos.
  for (const id of ["places", "presence", "city-live", "city-bubbles"]) {
    if (!m.getLayer(id)) continue;
    m.setLayoutProperty(id, "visibility", overlays.crowd ? "visible" : "none");
  }
  if (m.getLayer("places")) {
    // Zoom curves must stay outermost, so the size is scaled inside each stop.
    const k = prefs.markerScale;
    m.setPaintProperty("places", "circle-radius", ["interpolate", ["linear"], ["zoom"],
      10, ["case", ["==", ["get", "live"], 1], 5 * k, 3 * k], 15, ["case", ["==", ["get", "live"], 1], 11 * k, 8 * k]]);
    m.setPaintProperty("places", "circle-opacity", ["*", prefs.crowdOpacity, ["case", ["==", ["get", "live"], 1], 1, 0.55]]);
  }

  // Contours (MapTiler), drawn under our layers.
  const key = mapTilerKey();
  if (overlays.contours && key) {
    if (!m.getSource("cm-contours")) {
      m.addSource("cm-contours", { type: "vector", url: contoursSourceUrl(), attribution: MAPTILER_ATTRIBUTION });
    }
    if (!m.getLayer("cm-contours")) {
      m.addLayer({
        id: "cm-contours", type: "line", source: "cm-contours", "source-layer": "contour",
        paint: { "line-color": "#a16207", "line-width": ["case", ["==", ["get", "nth_line"], 5], 1.2, 0.5], "line-opacity": prefs.contoursOpacity },
      }, m.getLayer("presence") ? "presence" : undefined);
    } else {
      m.setPaintProperty("cm-contours", "line-opacity", prefs.contoursOpacity);
    }
  } else if (m.getLayer("cm-contours")) {
    m.removeLayer("cm-contours");
  }

  // Terrain: real elevation (free Terrarium tiles). Hills and mountains rise in 3D,
  // with hill shading and a sky so the horizon reads as land, not a flat map.
  if (basemap === "terrain") {
    if (!m.getSource("cm-dem")) m.addSource("cm-dem", TERRAIN_DEM);
    // Hill shading has its own copy of the elevation (MapLibre advises not sharing one source).
    if (!m.getSource("cm-dem-shade")) m.addSource("cm-dem-shade", TERRAIN_DEM);
    if (!m.getLayer("cm-hillshade")) {
      m.addLayer({
        id: "cm-hillshade", type: "hillshade", source: "cm-dem-shade",
        paint: {
          "hillshade-exaggeration": 0.6, "hillshade-shadow-color": "#3f3a2e",
          "hillshade-highlight-color": "#fffdf5", "hillshade-accent-color": "#6b5b3e",
        },
      }, style.layers.find((l) => l.type === "symbol" || l.type === "fill-extrusion")?.id);
    }
    m.setTerrain({ source: "cm-dem", exaggeration: 1.6 });
    m.setSky({ "sky-color": "#7cb8ef", "horizon-color": "#dbeafe", "fog-color": "#e5e7eb", "sky-horizon-blend": 0.6, "horizon-fog-blend": 0.6, "fog-ground-blend": 0.3 });
  } else {
    if (m.getTerrain()) m.setTerrain(null);
    if (m.getLayer("cm-hillshade")) m.removeLayer("cm-hillshade");
  }

  // Our layers always on top, in a fixed order.
  for (const id of OWN_LAYERS) if (m.getLayer(id)) m.moveLayer(id);
}

/**
 * Multiplies a text-size value by k, keeping zoom curves valid: plain numbers,
 * "interpolate"/"step" expressions (scale each output) and legacy {stops}.
 * Returns null for anything else, which is then left untouched.
 */
function scaleSize(v: unknown, k: number): unknown {
  if (typeof v === "number") return Math.round(v * k * 10) / 10;
  if (Array.isArray(v) && v[0] === "interpolate") {
    // ["interpolate", type, input, z1, out1, z2, out2, ...]
    return v.map((x, i) => (i >= 4 && i % 2 === 0 ? scaleSize(x, k) ?? x : x));
  }
  if (Array.isArray(v) && v[0] === "step") {
    // ["step", input, out0, z1, out1, ...]
    return v.map((x, i) => (i >= 2 && i % 2 === 0 ? scaleSize(x, k) ?? x : x));
  }
  if (v && typeof v === "object" && Array.isArray((v as { stops?: unknown }).stops)) {
    const o = v as { stops: [number, number][] };
    return { ...o, stops: o.stops.map(([z, s]) => [z, typeof s === "number" ? Math.round(s * k * 10) / 10 : s]) };
  }
  if (Array.isArray(v)) return ["*", k, v]; // other data expressions (no zoom inside)
  return null;
}

/** CSS filter for the palette presets that recolour the whole map. */
export function paletteFilter(p: MapPrefs["palette"]) {
  if (p === "sepia") return "sepia(0.55) saturate(0.9) brightness(1.02)";
  if (p === "contrast") return "contrast(1.35) saturate(1.15)";
  return "";
}

// ---- Small geometry helpers for the tools ---------------------------------
export function haversineKm(a: [number, number], b: [number, number]) {
  const R = 6371, rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b[1] - a[1]), dLng = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export const pathKm = (pts: [number, number][]) => pts.slice(1).reduce((s, p, i) => s + haversineKm(pts[i], p), 0);
