"use client";
import { Icon } from "@/components/icons/Icon";
import { iconSvg } from "@/components/icons/Icon";
// Live crowd map: OpenStreetMap (via OpenFreeMap) with each place coloured by
// its crowd level. Solid = live from reports, faded = estimated. Search,
// filters and a sortable list sit on top. User 1 feature.
import "maplibre-gl/dist/maplibre-gl.css";
import {
  AttributionControl, Map as MLMap, Marker, ScaleControl, setWorkerUrl,
  type GeoJSONSource, type MapLayerMouseEvent, type MapMouseEvent,
} from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { preconnect } from "react-dom";
import { crowdConfig, quickIcon } from "@/features/crowd/config";
import { ConfirmPrompt } from "@/features/crowd/ConfirmPrompt";
import { PlaceSheet } from "@/features/crowd/PlaceSheet";
import { loadPresencePreference, savePresencePreference, usePresence } from "@/features/crowd/usePresence";
import { AddPlaceSheet } from "@/features/places/AddPlaceSheet";
import { messages as placeMessages } from "@/features/places/messages";
import { FilterSheet, PlaceList } from "@/features/search/Explore";
import { applyFilters, countActive, DEFAULT_FILTERS, type Filters } from "@/features/search/filters";
import { messages as searchMessages } from "@/features/search/messages";
import { SearchBox, type SearchHit, type SearchPoint } from "@/features/search/SearchBox";
import { config, type Language } from "@/lib/config";
import { translator } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { messages } from "./messages";
import { useCityUpdates } from "./useCityUpdates";
import { DEFAULT_OVERLAYS, styleUrl, type BasemapId, type OverlayId } from "./basemaps";
import { applyOverlays, carryOver, DEFAULT_PREFS, OWN_LAYERS, paletteFilter, type MapPrefs } from "./mapLayers";
import { MapDock, type DockKey } from "./controls/MapDock";
import { CustomizePanel, LayersPanel, NewMarkerForm, PlacesPanel, ToolsPanel, type ToolMode } from "./controls/MapPanels";
import { messages as controlMessages } from "./controls/messages";
import { clearPrefs, loadMarkers, loadPrefs, loadShapes, newId, saveMarkers, savePrefs, saveShapes, type Shape, type UserMarker } from "./controls/store";
import { ZoomSlider } from "./controls/ZoomSlider";
import { CityPicker } from "./controls/CityPicker";
import { LoadingBar } from "@/components/LoadingBar";
import { PlaceCard } from "./PlaceCard";
import { LocationAsk, locationPermission, type LocationReason } from "./LocationAsk";
import { GoButtons, GoPanel, type GoDest, type GoMode, type GoStatus } from "./GoPanel";

// Worker file is copied into public/ by scripts/copy-map-worker.mjs.
setWorkerUrl("/maplibre-gl-worker.js");

const TILE_ORIGIN = new URL(config.map.styleUrl).origin;
const OWN_LAYER_IDS = new Set(OWN_LAYERS);
// Basemap label layers that name areas, roads or water rather than a place you can visit.
const NOT_PLACE_LABELS = new Set(["place", "transportation_name", "water_name", "waterway", "boundary", "mountain_peak", "housenumber"]);

export type MapCity = { id: string; name: string; name_hi: string | null; state?: string | null; lat: number; lng: number; default_zoom: number };
/** Kept for the home page's props; places are now loaded per city from /api/crowd. */
export type MapPlace = { id: string; name: string; name_hi: string | null; category: string; lat: number; lng: number; city_id: string };

type CrowdPlace = {
  id: string; name: string; name_hi: string | null; category: string; lat: number; lng: number;
  level: number; source: "live" | "estimated"; reports: number; status?: "listed" | "unconfirmed"; here?: number; sample?: boolean;
};
type Alert = { id: string; kind: string; place_id: string | null; lat: number; lng: number };
type CrowdData = { city: string; places: CrowdPlace[]; alerts: Alert[] };
type LatLng = { lat: number; lng: number };
/** One bubble per city when zoomed out (from /api/crowd/overview). */
type CityBubble = { id: string; name: string; name_hi: string | null; lat: number; lng: number; zoom: number; places: number; level: number | null; live: number };

const LEVEL_COLOR = ["match", ["get", "level"],
  ...config.crowd.levels.flatMap((l) => [l.level, l.color]), config.crowd.noDataColor] as unknown as string;
// City bubbles fade out (and each city's own dots fade in) between these zooms.
const BUBBLE_FADE: [number, number] = [8, 9.5];
// Bubble size grows with the number of places, and with the zoom.
const BUBBLE_R = ["+", 7, ["*", 0.55, ["sqrt", ["get", "places"]]]];
// Load the dots of up to this many other cities that are on screen when zoomed in.
const MAX_NEARBY = 3;

/** Straight-line distance in metres. */
function metres(a: LatLng, b: LatLng) {
  const r = Math.PI / 180;
  const x = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(x));
}

/** A place to open on load (from /?place=<id>). */
export type LinkedPlace = { id: string; lat: number; lng: number; city_id: string };

export function MapView({ lang, cities, initialPlace = null, initialFocus = null, openDetails = false, signedIn = false }: {
  lang: Language; cities: MapCity[]; places?: MapPlace[]; initialPlace?: LinkedPlace | null;
  /** Open the linked place's full panel (report buttons) straight away, e.g. from a "please confirm" notification. */
  openDetails?: boolean;
  /** Signed-in people share their location by default (so a room full of people shows as busy). */
  signedIn?: boolean;
  /** Centre here on load (from the home page search). */
  initialFocus?: { lat: number; lng: number; zoom: number } | null;
}) {
  const t = translator(messages, lang);
  const ts = translator(searchMessages, lang);
  const tp = translator(placeMessages, lang);
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const alertMarkers = useRef<Marker[]>([]);
  const newPin = useRef<Marker | null>(null);
  const [adding, setAdding] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [placeVersion, setPlaceVersion] = useState(0);
  const presence = usePresence(sharing);
  // Start connecting to the map server while the page is still loading.
  preconnect(TILE_ORIGIN, { crossOrigin: "anonymous" });

  // Restore "share my location" after the page has loaded (browser-only setting).
  // Signed-in people share by default: silently if location is already allowed, otherwise
  // after our popup ("Not now" turns it off on this device).
  useEffect(() => {
    if (!signedIn || !loadPresencePreference()) return;
    void (async () => {
      const perm = await locationPermission();
      if (perm === "granted") setSharing(true);
      else if (perm !== "denied") setLocAsk({ reason: "share", blocked: false, run: () => setSharing(true), onNo: () => savePresencePreference(false) });
    })();
  }, [signedIn]);
  // Location: our own popup first (why, Allow / Not now), then the browser's prompt.
  const [mobileMenu, setMobileMenu] = useState(false);
  const [locAsk, setLocAsk] = useState<{ reason: LocationReason; blocked: boolean; run: () => void; onNo?: () => void } | null>(null);
  async function withLocation(reason: LocationReason, run: () => void, onNo?: () => void) {
    const perm = await locationPermission();
    if (perm === "granted") run();
    else setLocAsk({ reason, blocked: perm === "denied", run, onNo });
  }
  function toggleSharing() {
    if (sharing) { savePresencePreference(false); setSharing(false); return; }
    void withLocation("share", () => { savePresencePreference(true); setSharing(true); });
  }
  // Start in the linked place's city, else the city nearest the requested spot, else the default.
  const focusCity = initialFocus ? cities.reduce<MapCity | null>((b, c) =>
    !b || (c.lat - initialFocus.lat) ** 2 + (c.lng - initialFocus.lng) ** 2 < (b.lat - initialFocus.lat) ** 2 + (b.lng - initialFocus.lng) ** 2 ? c : b, null) : null;
  const startCity = cities.find((c) => c.id === (initialPlace?.city_id ?? focusCity?.id ?? config.defaultCity)) ?? cities[0] ?? null;
  const [ready, setReady] = useState(false);
  // Map tiles still downloading (for the loading bar).
  const [tilesLoading, setTilesLoading] = useState(true);
  const [activeCity, setActiveCity] = useState<string | null>(startCity?.id ?? null);
  const [data, setData] = useState<CrowdData | null>(null);
  const [selected, setSelected] = useState<string | null>(initialPlace?.id ?? null);
  // The picked place shows as a flip card; "More details" opens the full panel.
  const [details, setDetails] = useState(openDetails);
  const selectedRef = useRef<string | null>(null);
  useEffect(() => { selectedRef.current = selected; }, [selected]);
  /** Shows a place as a card (never straight into the full panel). */
  // Only uses state setters, so the map's one-time handlers can safely keep the first copy.
  function selectPlace(id: string | null) {
    setDetails(false); setSelected(id);
    // One window at a time: a place card closes the panels.
    if (id) { setDockPanel(null); setPanel(null); setAdding(false); }
  }
  const [panel, setPanel] = useState<"filters" | "list" | null>(null);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [me, setMe] = useState<LatLng | null>(null);
  const [centre, setCentre] = useState<LatLng | null>(startCity ? { lat: startCity.lat, lng: startCity.lng } : null);
  const [locError, setLocError] = useState("");

  // Map type, layers, style and the viewer's own extras (step 4 of the design brief).
  const tc = translator(controlMessages, lang);
  const rootRef = useRef<HTMLDivElement>(null);
  const [basemap, setBasemap] = useState<BasemapId>("street");
  const [overlays, setOverlays] = useState<Record<OverlayId, boolean>>(DEFAULT_OVERLAYS);
  const [prefs, setPrefs] = useState<MapPrefs>(DEFAULT_PREFS);
  // The site's day/night setting drives the map's light and dark palettes.
  const { resolved: siteTheme, setTheme: setSiteTheme } = useTheme();
  const paletteRef = useRef<MapPrefs["palette"]>(DEFAULT_PREFS.palette);
  const prefsRef = useRef(prefs);
  useEffect(() => { prefsRef.current = prefs; }, [prefs]);
  useEffect(() => { paletteRef.current = prefs.palette; }, [prefs.palette]);
  const [dockPanel, setDockPanel] = useState<"layers" | "customize" | "places" | "tools" | null>(null);
  const [zoom, setZoom] = useState(initialPlace ? 16 : initialFocus ? initialFocus.zoom : startCity?.default_zoom ?? 12);
  const [bearing, setBearing] = useState(0);
  const [pitch, setPitch] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [markers, setMarkers] = useState<UserMarker[]>([]);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [toolMode, setToolMode] = useState<ToolMode>(null);
  const [measurePts, setMeasurePts] = useState<[number, number][]>([]);
  const [drawPts, setDrawPts] = useState<[number, number][]>([]);
  const [newMarker, setNewMarker] = useState<{ lat: number; lng: number; x: number; y: number; w: number } | null>(null);
  const [styleVersion, setStyleVersion] = useState(0);
  const toolRef = useRef<ToolMode>(null);
  useEffect(() => { toolRef.current = toolMode; }, [toolMode]);
  const userMarkerEls = useRef<Marker[]>([]);

  // ---- Directions ("Go") ------------------------------------------------------
  const [go, setGo] = useState<GoDest | null>(null);
  const [goMode, setGoMode] = useState<GoMode>("drive");
  const [goStatus, setGoStatus] = useState<GoStatus>("locating");
  const [goRoute, setGoRoute] = useState<{ distance: number; duration: number; from: LatLng } | null>(null);
  const [goTry, setGoTry] = useState(0);
  const [following, setFollowing] = useState(false);
  /** A dropped pin the viewer tapped (shows Directions / Uber for it). */
  const [pinPick, setPinPick] = useState<UserMarker | null>(null);
  const meMarker = useRef<Marker | null>(null);

  // Every place currently on the map (the active city and nearby ones), for taps on labels.
  const placesRef = useRef<CrowdPlace[]>([]);
  /** The place a tap means: a dot within a finger's width, else the map label under it. */
  function placeAtTap(m: MLMap, e: MapMouseEvent): string | null {
    const pad = 10;
    const box: [[number, number], [number, number]] = [[e.point.x - pad, e.point.y - pad], [e.point.x + pad, e.point.y + pad]];
    const here = { lat: e.lngLat.lat, lng: e.lngLat.lng };
    const close = placesRef.current.map((p) => ({ p, d: metres(here, p) })).filter((x) => x.d < 800).sort((a, b) => a.d - b.d);
    // 1. A map label under the finger whose name matches one of our places ("Indian Institute of Management Indore").
    // Labels of places and buildings only: not city or area names, roads or water.
    const labels = m.queryRenderedFeatures(box).filter((f) => f.layer.type === "symbol" && !OWN_LAYER_IDS.has(f.layer.id)
      && !NOT_PLACE_LABELS.has(f.sourceLayer ?? "") && typeof (f.properties?.["name:en"] ?? f.properties?.name) === "string");
    const names = labels.flatMap((f) => [f.properties?.["name:en"], f.properties?.name])
      .filter((n): n is string => typeof n === "string" && n.trim().length > 2).map((n) => n.toLowerCase().trim());
    for (const label of names) {
      const exact = close.find((x) => x.p.name.toLowerCase() === label);
      if (exact) return exact.p.id;
    }
    for (const label of names) {
      const part = close.find((x) => {
        const n = x.p.name.toLowerCase();
        return x.d < 400 && Math.min(n.length, label.length) >= 5 && (n.includes(label) || label.includes(n));
      });
      if (part) return part.p.id;
    }
    // 2. A near miss on one of our dots.
    if (m.getLayer("places")) {
      const best = m.queryRenderedFeatures(box, { layers: ["places"] }).map((f) => {
        const [x, y] = (f.geometry as GeoJSON.Point).coordinates;
        const pt = m.project([x, y]);
        return { id: f.properties?.id as string, d: Math.hypot(pt.x - e.point.x, pt.y - e.point.y) };
      }).sort((a, b) => a.d - b.d)[0];
      if (best?.id) return best.id;
    }
    // 3. A label with no match by name: the place right by it, if there is one.
    if (labels.length && close[0] && close[0].d < 60) return close[0].p.id;
    return null;
  }

  // Create the map once.
  // Create the map once.
  useEffect(() => {
    if (!box.current) return;
    const m = new MLMap({
      container: box.current,
      style: styleUrl("street"),
      // Keep our layers when the map type changes, and allow PNG export.
      transformStyle: carryOver,
      canvasContextAttributes: { preserveDrawingBuffer: true },
      center: initialPlace ? [initialPlace.lng, initialPlace.lat] : initialFocus ? [initialFocus.lng, initialFocus.lat]
        : startCity ? [startCity.lng, startCity.lat] : config.map.worldCenter,
      zoom: initialPlace ? 16 : initialFocus ? initialFocus.zoom : startCity ? startCity.default_zoom : config.map.worldZoom,
      // Credits go bottom-left (the corner on the right holds the buttons).
      attributionControl: false,
      // Double tap drops a pin instead of zooming.
      doubleClickZoom: false,
      // Terrain looks across the hills, so allow a steeper tilt than the default 60°.
      maxPitch: 75,
      // Faster first paint: labels appear without a long fade, expired tiles aren't refetched mid-view.
      fadeDuration: 100,
      refreshExpiredTiles: false,
    });
    map.current = m;
    m.addControl(new ScaleControl({ maxWidth: 100, unit: "metric" }), "bottom-left");
    m.addControl(new AttributionControl({ compact: true }), "bottom-left");
    m.on("moveend", () => {
      const c = m.getCenter();
      setCentre({ lat: c.lat, lng: c.lng });
      // Follow the map: zoomed in near another city, that city's places load.
      if (m.getZoom() >= 9.5) {
        const near = nearestCity(c.lat, c.lng);
        if (near && Math.hypot(near.lat - c.lat, (near.lng - c.lng) * Math.cos((c.lat * Math.PI) / 180)) < 0.6) setActiveCity(near.id);
      }
    });
    let raf = 0;
    const sync = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => { setZoom(m.getZoom()); setBearing(m.getBearing()); setPitch(m.getPitch()); });
    };
    m.on("move", sync);
    m.on("movestart", () => setNewMarker(null));
    m.on("style.load", () => setStyleVersion((v) => v + 1));
    m.on("dataloading", () => setTilesLoading(true));
    m.on("idle", () => setTilesLoading(false));
    m.on("click", (e: MapMouseEvent) => {
      const pt: [number, number] = [e.lngLat.lng, e.lngLat.lat];
      const mode = toolRef.current;
      if (mode === "measure") { setMeasurePts((p) => [...p, pt]); return; }
      if (mode === "point") { setDrawPts([pt]); return; }
      if (mode === "line" || mode === "area") { setDrawPts((p) => [...p, pt]); return; }
      // Clicks on a place open the place; a tap on an empty spot closes everything.
      if (m.getLayer("places") && m.queryRenderedFeatures(e.point, { layers: ["places"] }).length) return;
      // A near miss on a small dot, or a tap on the map's own label ("Indian Institute of
      // Management Indore", a temple's name…) opens our place for it.
      const hit = placeAtTap(m, e);
      if (hit) { selectPlace(hit); return; }
      selectPlace(null); setPanel(null); setDockPanel(null); setNewMarker(null); setPinPick(null);
    });
    // Double tap or right click drops a pin right there (no form, no colour picker).
    const pin = (e: MapMouseEvent) => {
      if (toolRef.current) return;
      e.preventDefault();
      dropPin(e.lngLat.lat, e.lngLat.lng);
    };
    m.on("dblclick", pin);
    m.on("contextmenu", pin);
    // Scrolling the map shows the zoom control for a moment.
    m.on("wheel", () => flashZoom());
    // Set up our layers as soon as the style is ready, not after every first tile has
    // downloaded ("load"), so a slow connection doesn't leave the loading screen up.
    let initialised = false;
    const init = () => {
      if (initialised) return;
      initialised = true;
      // The route for Directions, under the crowd dots.
      m.addSource("cm-route", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({ id: "cm-route-casing", type: "line", source: "cm-route", layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#1e3a8a", "line-width": ["interpolate", ["linear"], ["zoom"], 10, 6, 16, 12], "line-opacity": 0.9 } });
      m.addLayer({ id: "cm-route-line", type: "line", source: "cm-route", filter: ["!=", ["get", "mode"], "walk"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#3b82f6", "line-width": ["interpolate", ["linear"], ["zoom"], 10, 3.5, 16, 8] } });
      // Walking: dotted cyan line.
      m.addLayer({ id: "cm-route-walk", type: "line", source: "cm-route", filter: ["==", ["get", "mode"], "walk"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#22d3ee", "line-width": ["interpolate", ["linear"], ["zoom"], 10, 3.5, 16, 8], "line-dasharray": [0.6, 1.6] } });

      // Every city as one crowd bubble when zoomed out: colour = typical crowd now,
      // size = number of places, blue ring = live reports there.
      m.addSource("cm-cities", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({
        id: "city-live", type: "circle", source: "cm-cities", maxzoom: BUBBLE_FADE[1], filter: [">", ["get", "live"], 0],
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, ["+", 4, ["*", 0.55, BUBBLE_R]], 7, ["+", 8, BUBBLE_R]] as unknown as number,
          "circle-color": "#3b82f6",
          "circle-opacity": ["interpolate", ["linear"], ["zoom"], BUBBLE_FADE[0], 0.3, BUBBLE_FADE[1], 0],
          "circle-blur": 0.4,
        },
      });
      m.addLayer({
        id: "city-bubbles", type: "circle", source: "cm-cities", maxzoom: BUBBLE_FADE[1],
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, ["*", 0.55, BUBBLE_R], 7, BUBBLE_R] as unknown as number,
          "circle-color": LEVEL_COLOR,
          "circle-opacity": ["interpolate", ["linear"], ["zoom"], BUBBLE_FADE[0], 0.8, BUBBLE_FADE[1], 0],
          "circle-stroke-color": ["case", [">", ["get", "live"], 0], "#3b82f6", "#ffffff"],
          "circle-stroke-width": ["case", [">", ["get", "live"], 0], 2.5, 1.5],
          "circle-stroke-opacity": ["interpolate", ["linear"], ["zoom"], BUBBLE_FADE[0], 0.9, BUBBLE_FADE[1], 0],
        },
      });
      m.on("click", "city-bubbles", (e: MapLayerMouseEvent) => {
        if (toolRef.current) return;
        const p = e.features?.[0]?.properties;
        if (!p || typeof p.id !== "string") return;
        setActiveCity(p.id);
        m.flyTo({ center: [Number(p.lng), Number(p.lat)], zoom: Number(p.zoom) || 12, essential: true });
      });
      m.on("mouseenter", "city-bubbles", () => { m.getCanvas().style.cursor = "crosshair"; });
      m.on("mouseleave", "city-bubbles", () => { m.getCanvas().style.cursor = ""; });

      m.addSource("places", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      // Blue halo where CrowdMap users are right now (drawn under the dots).
      m.addLayer({
        id: "presence", minzoom: BUBBLE_FADE[0],
        type: "circle",
        source: "places",
        filter: [">", ["get", "here"], 0],
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 8, 15, 20],
          "circle-color": "#3b82f6",
          "circle-opacity": 0.25,
          "circle-stroke-color": "#3b82f6",
          "circle-stroke-width": 1,
          "circle-stroke-opacity": 0.6,
        },
      });
      m.addLayer({
        id: "places", minzoom: BUBBLE_FADE[0],
        type: "circle",
        source: "places",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, ["case", ["==", ["get", "live"], 1], 5, 3], 15, ["case", ["==", ["get", "live"], 1], 11, 8]],
          "circle-color": LEVEL_COLOR,
          "circle-opacity": ["case", ["==", ["get", "live"], 1], 1, 0.55],
          // Purple ring = added by a user, not confirmed yet. Amber ring = sample (demo) data.
          "circle-stroke-color": ["case", ["==", ["get", "unconfirmed"], 1], "#7c3aed", ["==", ["get", "sample"], 1], "#f59e0b", "#ffffff"],
          "circle-stroke-width": ["case", ["==", ["get", "unconfirmed"], 1], 3, ["==", ["get", "live"], 1], 2.5, 1],
        },
      });
      // The viewer's drawings and measurements.
      m.addSource("cm-shapes", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({ id: "cm-shapes-fill", type: "fill", source: "cm-shapes", filter: ["==", ["geometry-type"], "Polygon"],
        paint: { "fill-color": ["get", "color"], "fill-opacity": 0.2 } });
      m.addLayer({ id: "cm-shapes-line", type: "line", source: "cm-shapes", filter: ["!=", ["geometry-type"], "Point"],
        paint: { "line-color": ["get", "color"], "line-width": ["get", "width"] } });
      m.addLayer({ id: "cm-shapes-point", type: "circle", source: "cm-shapes", filter: ["==", ["geometry-type"], "Point"],
        paint: { "circle-color": ["get", "color"], "circle-radius": 7, "circle-stroke-color": "#fff", "circle-stroke-width": 2 } });
      m.addSource("cm-measure", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({ id: "cm-measure-line", type: "line", source: "cm-measure", filter: ["==", ["geometry-type"], "LineString"],
        paint: { "line-color": "#0894FF", "line-width": 3, "line-dasharray": [2, 1.5] } });
      m.addLayer({ id: "cm-measure-point", type: "circle", source: "cm-measure", filter: ["==", ["geometry-type"], "Point"],
        paint: { "circle-color": "#fff", "circle-radius": 5, "circle-stroke-color": "#0894FF", "circle-stroke-width": 2.5 } });
      setStyleVersion((v) => v + 1);
      m.on("click", "places", (e: MapLayerMouseEvent) => {
        if (toolRef.current) return; // measuring or drawing: clicks only add points
        const id = e.features?.[0]?.properties?.id;
        if (typeof id === "string") selectPlace(id);
      });
      m.on("mouseenter", "places", () => { m.getCanvas().style.cursor = "crosshair"; });
      m.on("mouseleave", "places", () => { m.getCanvas().style.cursor = ""; });
      setReady(true);
    };
    m.once("style.load", init);
    m.once("load", init);
    return () => { cancelAnimationFrame(raf); m.remove(); map.current = null; };
    // The map is created once; data updates are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadCity = useCallback(async (city: string, fresh = false) => {
    try {
      // Normal loads may come from the edge cache (20 s); after a change we ask for fresh data.
      const res = await fetch(`/api/crowd?city=${encodeURIComponent(city)}${fresh ? "&fresh=1" : ""}`, { cache: fresh ? "no-store" : "default" });
      if (res.ok) setData({ city, ...(await res.json()) });
    } catch {
      // Keep showing the last data; the next poll will retry.
    }
  }, []);

  // Load the active city now and every minute.
  useEffect(() => {
    if (!activeCity) return;
    let cancelled = false;
    const run = () => { if (!cancelled) void loadCity(activeCity); };
    run();
    const id = setInterval(run, crowdConfig.refreshMs);
    return () => { cancelled = true; clearInterval(id); };
  }, [activeCity, loadCity]);

  // Instant updates: reload the city when anything changes, and the open panel if it's affected.
  useCityUpdates(activeCity, (ids) => {
    if (activeCity) void loadCity(activeCity, true);
    if (selected && ids.has(selected)) setPlaceVersion((v) => v + 1);
  });

  // Every city's bubble (zoomed out); refreshed with the crowd data.
  const [overview, setOverview] = useState<CityBubble[]>([]);
  useEffect(() => {
    let cancelled = false;
    const run = () => fetch("/api/crowd/overview").then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled && j?.cities) setOverview(j.cities); }).catch(() => {});
    void run();
    const id = setInterval(run, crowdConfig.refreshMs * 5);
    return () => { cancelled = true; clearInterval(id); };
  }, []);
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    (m.getSource("cm-cities") as GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: overview.map((c) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [c.lng, c.lat] },
        properties: { id: c.id, level: c.level ?? 0, places: c.places, live: c.live, lat: c.lat, lng: c.lng, zoom: c.zoom },
      })),
    });
  }, [overview, ready, styleVersion]);

  // Zoomed in where two cities meet (Delhi, Noida, Gurugram…): the other cities on
  // screen load their dots too, not just the active one.
  const [nearby, setNearby] = useState<Record<string, CrowdPlace[]>>({});
  const nearbyIds = useMemo(() => {
    const m = map.current;
    if (!ready || !m || zoom < BUBBLE_FADE[0] || !centre) return [];
    const b = m.getBounds();
    const pad = 0.25;
    return cities
      .filter((c) => c.id !== activeCity && c.lat > b.getSouth() - pad && c.lat < b.getNorth() + pad && c.lng > b.getWest() - pad && c.lng < b.getEast() + pad)
      .sort((a, b2) => (a.lat - centre.lat) ** 2 + (a.lng - centre.lng) ** 2 - ((b2.lat - centre.lat) ** 2 + (b2.lng - centre.lng) ** 2))
      .slice(0, MAX_NEARBY).map((c) => c.id);
    // Recomputed when the map stops moving (centre) or crosses a whole zoom step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, centre, Math.floor(zoom), activeCity, cities]);
  useEffect(() => {
    let cancelled = false;
    for (const id of nearbyIds) {
      if (nearby[id]) continue;
      fetch(`/api/crowd?city=${encodeURIComponent(id)}`).then((r) => (r.ok ? r.json() : null))
        .then((j) => { if (!cancelled && j?.places) setNearby((n) => ({ ...n, [id]: j.places })); }).catch(() => {});
    }
    return () => { cancelled = true; };
  }, [nearbyIds, nearby]);

  // Places that pass the filters, sorted; distances from me, or else the map centre.
  const cityPlaces = useMemo(() => (data && data.city === activeCity ? data.places : []), [data, activeCity]);
  const visible = useMemo(() => applyFilters(cityPlaces, filters, me ?? centre), [cityPlaces, filters, me, centre]);
  const nearbyVisible = useMemo(() => nearbyIds.flatMap((id) => (nearby[id] ? applyFilters(nearby[id], filters, me ?? centre) : [])),
    [nearbyIds, nearby, filters, me, centre]);

  useEffect(() => { placesRef.current = [...visible, ...nearbyVisible]; }, [visible, nearbyVisible]);

  // Push the visible places and alerts into the map.
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    (m.getSource("places") as GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: [...visible, ...nearbyVisible].map((p) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [p.lng, p.lat] },
        properties: {
          id: p.id, level: p.level, live: p.source === "live" ? 1 : 0,
          unconfirmed: p.status === "unconfirmed" ? 1 : 0, here: p.here ?? 0, sample: p.sample ? 1 : 0,
        },
      })),
    });
  }, [visible, nearbyVisible, ready, styleVersion]);

  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    alertMarkers.current.forEach((mk) => mk.remove());
    alertMarkers.current = (data?.alerts ?? []).map((a) => {
      const el = document.createElement("button");
      el.type = "button";
      el.innerHTML = iconSvg(quickIcon(a.kind), 16);
      el.className = "grid h-7 w-7 place-items-center rounded-full bg-white text-base shadow-md ring-2 ring-amber-400";
      el.setAttribute("aria-label", a.kind.replace("_", " "));
      if (a.place_id) el.addEventListener("click", (ev) => { if (toolRef.current) return; ev.stopPropagation(); selectPlace(a.place_id); });
      return new Marker({ element: el, offset: [12, -12] }).setLngLat([a.lng, a.lat]).addTo(m);
    });
  }, [data, ready]);

  // ---- Map type, layers and style --------------------------------------------
  // Restore this viewer's saved style, markers and drawings, and a shared view (?b=&o=).
  useEffect(() => {
    queueMicrotask(() => {
      const saved = loadPrefs();
      paletteRef.current = saved.palette;
      setPrefs(saved);
      setMarkers(loadMarkers());
      setShapes(loadShapes());
      const q = new URLSearchParams(window.location.search);
      const b = q.get("b") as BasemapId | null;
      if (b && ["street", "felt", "dark", "3d", "satellite", "terrain"].includes(b)) setBasemap(b);
      else if (saved.palette === "dark") setBasemap("dark");
      const o = q.get("o");
      if (o !== null) {
        const on = new Set(o.split(","));
        setOverlays((cur) => Object.fromEntries(Object.keys(cur).map((k) => [k, on.has(k)])) as Record<OverlayId, boolean>);
      }
    });
  }, []);

  // Switch the basemap style (our layers are carried over by transformStyle).
  const appliedBase = useRef<BasemapId>("street");
  useEffect(() => {
    const m = map.current;
    if (!m || !ready || appliedBase.current === basemap) return;
    const was = appliedBase.current;
    appliedBase.current = basemap;
    m.setStyle(styleUrl(basemap));
    // Street, 3D and Terrain share one style, so the switch may not fire "style.load":
    // apply the overlays (elevation, buildings) again once the map has settled.
    m.once("idle", () => setStyleVersion((v) => v + 1));
    if (basemap === "3d") m.easeTo({ pitch: 60, bearing: -20, zoom: Math.max(m.getZoom(), 15.5), duration: 900 });
    else if (was === "3d" || basemap !== "terrain") { if (m.getPitch() > 0) m.easeTo({ pitch: 0, duration: 600 }); }
    // Terrain: tilt and step back a little so hills and mountains stand up from the ground.
    if (basemap === "terrain") m.easeTo({ pitch: 65, bearing: m.getBearing() || -15, zoom: Math.min(m.getZoom(), 13), duration: 1100 });
  }, [basemap, ready]);

  // Overlays, label and dot size, opacity: after every style load and on change.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    // Don't wait for every tile (isStyleLoaded stays false while tiles download, so on
    // a slow connection Terrain and the other overlays never came on). The style itself
    // just has to be ready; if it isn't, try again when it is.
    const run = () => { try { applyOverlays(m, basemap, overlays, prefs); return true; } catch { return false; } };
    if (!run()) m.once("styledata", () => { if (!run()) m.once("idle", run); });
  }, [overlays, prefs, basemap, ready, styleVersion]);

  // Palette presets: Dark switches the map style; Sepia and High contrast recolour it.
  useEffect(() => {
    if (box.current) box.current.style.filter = paletteFilter(prefs.palette);
  }, [prefs.palette]);
  function setPalette(p: MapPrefs["palette"]) {
    setPrefs((cur) => ({ ...cur, palette: p }));
    setBasemap((b) => (p === "dark" ? (b === "dark" || b === "satellite" ? b : "dark") : b === "dark" ? "street" : b));
  }
  // Follow the site theme; Sepia and High contrast stay as chosen.
  useEffect(() => {
    queueMicrotask(() => {
      const p = paletteRef.current;
      if ((p === "light" || p === "dark") && p !== siteTheme) setPalette(siteTheme);
    });
  }, [siteTheme]);

  // Drawings and the measuring line.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const color = prefs.drawColor;
    const width = prefs.lineWidth;
    const feats = [
      ...(overlays.saved ? shapes : []).map((sh) => ({
        type: "Feature" as const,
        properties: { color: sh.color, width },
        geometry: sh.kind === "point" ? { type: "Point" as const, coordinates: sh.coords[0] }
          : sh.kind === "line" ? { type: "LineString" as const, coordinates: sh.coords }
          : { type: "Polygon" as const, coordinates: [[...sh.coords, sh.coords[0]]] },
      })),
      // The drawing in progress.
      ...(drawPts.length && (toolMode === "point" || toolMode === "line" || toolMode === "area") ? [{
        type: "Feature" as const,
        properties: { color, width },
        geometry: toolMode === "point" || drawPts.length === 1 ? { type: "Point" as const, coordinates: drawPts[drawPts.length - 1] }
          : toolMode === "area" && drawPts.length >= 3 ? { type: "Polygon" as const, coordinates: [[...drawPts, drawPts[0]]] }
          : { type: "LineString" as const, coordinates: drawPts },
      }] : []),
    ];
    (m.getSource("cm-shapes") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: feats });
    (m.getSource("cm-measure") as GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: [
        ...(measurePts.length > 1 ? [{ type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: measurePts } }] : []),
        ...measurePts.map((c) => ({ type: "Feature" as const, properties: {}, geometry: { type: "Point" as const, coordinates: c } })),
      ],
    });
  }, [shapes, drawPts, measurePts, toolMode, overlays.saved, prefs.drawColor, prefs.lineWidth, ready, styleVersion]);

  // The viewer's markers (DOM markers with their name as a tooltip).
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    userMarkerEls.current.forEach((mk) => mk.remove());
    userMarkerEls.current = (overlays.saved ? markers : []).map((mk) => {
      const el = document.createElement("div");
      el.className = "h-4 w-4 rounded-full ring-2 ring-white shadow-md";
      el.style.background = mk.color;
      el.title = mk.name || tc("unnamed");
      // Tap a pin: Directions or an Uber to it.
      el.style.cursor = "crosshair";
      el.setAttribute("role", "button");
      el.setAttribute("aria-label", mk.name || tc("unnamed"));
      el.addEventListener("click", (e) => { e.stopPropagation(); if (!toolRef.current) { setSelected(null); setPinPick(mk); } });
      return new Marker({ element: el }).setLngLat([mk.lng, mk.lat]).addTo(m);
    });
  }, [markers, overlays.saved, ready, tc]);

  // Alerts layer switch.
  useEffect(() => {
    alertMarkers.current.forEach((mk) => { mk.getElement().style.display = overlays.alerts ? "" : "none"; });
  }, [overlays.alerts, data]);

  // Full screen.
  useEffect(() => {
    const on = () => setFullscreen(document.fullscreenElement === rootRef.current);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void rootRef.current?.requestFullscreen?.();
  }

  // Keyboard shortcuts (not while typing): + - zoom, arrows pan, Alt+L layers, Alt+T tools, Esc closes.
  // Plain letters and numbers go to the search box (see SearchBox).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest('input, textarea, select, [contenteditable="true"], [role="slider"]') || e.metaKey || e.ctrlKey) return;
      // Alt+L / Alt+T (by key position, since Alt changes the letter on a Mac).
      if (e.altKey) {
        if (e.code === "KeyL") setDockPanel((p) => (p === "layers" ? null : "layers"));
        else if (e.code === "KeyT") setDockPanel((p) => (p === "tools" ? null : "tools"));
        else return;
        e.preventDefault();
        return;
      }
      const m = map.current;
      if (!m) return;
      if (e.key === "Escape") { setDockPanel(null); setNewMarker(null); setToolMode(null); return; }
      if (el?.closest(".maplibregl-canvas")) return; // the map handles its own keys when focused
      const step = 120;
      if (e.key === "+" || e.key === "=") m.zoomIn();
      else if (e.key === "-" || e.key === "_") m.zoomOut();
      else if (e.key === "ArrowUp") m.panBy([0, -step]);
      else if (e.key === "ArrowDown") m.panBy([0, step]);
      else if (e.key === "ArrowLeft") m.panBy([-step, 0]);
      else if (e.key === "ArrowRight") m.panBy([step, 0]);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function pickDock(k: DockKey) {
    setNewMarker(null);
    // One window at a time.
    setSelected(null); setPanel(null); setAdding(false);
    setDockPanel((p) => (p === k ? null : k));
  }

  function dropPin(lat: number, lng: number) {
    setMarkers((prev) => {
      const next = [{ id: newId(), name: `${tc("pin")} ${prev.length + 1}`, color: prefsRef.current.drawColor, lat, lng, at: Date.now(), quick: true }, ...prev];
      saveMarkers(next);
      return next;
    });
    setOverlays((o) => ({ ...o, saved: true }));
  }
  // Zoom control: hidden behind a button; scrolling shows it for a moment.
  const [zoomOpen, setZoomOpen] = useState(false);
  const [zoomFlash, setZoomFlash] = useState(false);
  const zoomTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  function flashZoom() {
    setZoomFlash(true);
    clearTimeout(zoomTimer.current);
    zoomTimer.current = setTimeout(() => setZoomFlash(false), 2200);
  }

  function saveMarker(name: string, color: string) {
    if (!newMarker) return;
    const next = [{ id: newId(), name, color, lat: newMarker.lat, lng: newMarker.lng, at: Date.now() }, ...markers];
    setMarkers(next);
    saveMarkers(next);
    setNewMarker(null);
    setOverlays((o) => ({ ...o, saved: true }));
  }
  /** Pins dropped with a double tap or right click (older ones are recognised by their "Pin 3" name). */
  const isQuick = (mk: UserMarker) => mk.quick ?? /^(Pin|पिन) \d+$/.test(mk.name);
  const quickCount = markers.filter(isQuick).length;
  const [clearedPins, setClearedPins] = useState<UserMarker[] | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  function clearPins() {
    const gone = markers.filter(isQuick);
    const next = markers.filter((mk) => !isQuick(mk));
    setMarkers(next);
    saveMarkers(next);
    setClearedPins(gone);
    clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setClearedPins(null), 6000);
  }
  function undoClear() {
    if (!clearedPins) return;
    const next = [...clearedPins, ...markers];
    setMarkers(next);
    saveMarkers(next);
    setClearedPins(null);
  }
  function deleteMarker(id: string) {
    const next = markers.filter((m) => m.id !== id);
    setMarkers(next);
    saveMarkers(next);
  }
  function finishDrawing(name: string) {
    if (!toolMode || toolMode === "measure") return;
    const coords = toolMode === "point" ? drawPts.slice(-1) : drawPts;
    const next = [{ id: newId(), kind: toolMode, name, color: prefs.drawColor, coords, at: Date.now() }, ...shapes];
    setShapes(next);
    saveShapes(next);
    setDrawPts([]);
    setToolMode(null);
  }
  function deleteShape(id: string) {
    const next = shapes.filter((x) => x.id !== id);
    setShapes(next);
    saveShapes(next);
  }
  function chooseTool(mode: ToolMode) {
    if (mode) setSelected(null);
    setToolMode(mode);
    setDrawPts([]);
    if (mode !== "measure") setMeasurePts([]);
    setNewMarker(null);
  }
  function exportPng() {
    const m = map.current;
    if (!m) return;
    m.once("render", () => {
      const a = document.createElement("a");
      a.download = `crowdmap-${new Date().toISOString().slice(0, 10)}.png`;
      a.href = m.getCanvas().toDataURL("image/png");
      a.click();
    });
    m.triggerRepaint();
  }
  async function copyShareLink() {
    const m = map.current;
    if (!m) return false;
    const c = m.getCenter();
    const on = (Object.keys(overlays) as OverlayId[]).filter((k) => overlays[k]).join(",");
    const url = `${window.location.origin}/map?lat=${c.lat.toFixed(5)}&lng=${c.lng.toFixed(5)}&z=${m.getZoom().toFixed(1)}&b=${basemap}&o=${on}`;
    try { await navigator.clipboard.writeText(url); return true; } catch { window.prompt("Copy this link", url); return false; }
  }
  function printView() {
    setDockPanel(null);
    setTimeout(() => window.print(), 150);
  }

  function flyTo(c: MapCity) {
    setActiveCity(c.id);
    setSelected(null);
    map.current?.flyTo({ center: [c.lng, c.lat], zoom: c.default_zoom, essential: true });
  }

  /** Centre on a place (switching city if needed) and open its panel. */
  function openPlace(p: { id: string; lat: number; lng: number; city_id?: string }) {
    if (p.city_id && p.city_id !== activeCity) setActiveCity(p.city_id);
    setDetails(false);
    setSelected(p.id);
    if (window.matchMedia("(max-width: 639px)").matches) setPanel(null);
    map.current?.flyTo({ center: [p.lng, p.lat], zoom: Math.max(map.current.getZoom(), 15), essential: true });
  }

  /** Shows a temporary pin where a new place will go. */
  function showNewPin(lat: number, lng: number) {
    const m = map.current;
    if (!m) return;
    newPin.current?.remove();
    newPin.current = new Marker({ color: "#7c3aed" }).setLngLat([lng, lat]).addTo(m);
    m.flyTo({ center: [lng, lat], zoom: 17, essential: true });
  }

  /** One window at a time: closes the dock panel, the place card and Add place. */
  function closeOthers() { setDockPanel(null); setSelected(null); setDetails(false); setAdding(false); setNewMarker(null); setPinPick(null); setGo(null); setFollowing(false); }

  function closeAdding() {
    setAdding(false);
    newPin.current?.remove();
    newPin.current = null;
  }

  function nearestCity(lat: number, lng: number) {
    return cities.reduce<MapCity | null>((best, c) => {
      const d = (c.lat - lat) ** 2 + (c.lng - lng) ** 2;
      return !best || d < (best.lat - lat) ** 2 + (best.lng - lng) ** 2 ? c : best;
    }, null);
  }

  function locate(fly = true) {
    setLocError("");
    if (!navigator.geolocation) { setLocError(t("locate.unsupported")); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setMe({ lat, lng });
        const near = nearestCity(lat, lng);
        if (near) setActiveCity(near.id);
        if (fly) map.current?.flyTo({ center: [lng, lat], zoom: 15 });
      },
      () => setLocError(t("locate.denied")),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  /** Directions to a place or pin: closes the card, draws the route from where you are. */
  function startGo(dest: GoDest) {
    setSelected(null); setDetails(false); setDockPanel(null); setPanel(null); setPinPick(null); setFollowing(false);
    setGoMode(me && metres(me, dest) <= config.routing.walkUpToM ? "walk" : "drive");
    setGo(dest);
  }
  /** Directions, asking for location first through our popup when we don't have it yet. */
  function goTo(dest: GoDest) {
    if (me) startGo(dest);
    else void withLocation("route", () => startGo(dest), () => startGo(dest));
  }
  function stopGo() {
    setGo(null); setFollowing(false); setGoRoute(null);
  }

  // Find the route whenever the destination, the mode or a retry changes.
  const meRef = useRef<LatLng | null>(null);
  useEffect(() => { meRef.current = me; }, [me]);
  useEffect(() => {
    const m = map.current;
    const src = () => m?.getSource("cm-route") as GeoJSONSource | undefined;
    if (!go) { src()?.setData({ type: "FeatureCollection", features: [] }); return; }
    let cancelled = false;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), config.routing.timeoutMs);
    const route = async (from: LatLng) => {
      if (cancelled) return;
      setGoStatus("routing");
      try {
        const res = await fetch(config.routing.routeUrl(goMode, [from.lng, from.lat], [go.lng, go.lat]), { signal: ctrl.signal });
        const j = res.ok ? await res.json() : null;
        const r = j?.routes?.[0];
        if (cancelled) return;
        if (!r) { setGoStatus("error"); return; }
        setGoRoute({ distance: r.distance, duration: r.duration, from });
        src()?.setData({ type: "FeatureCollection", features: [{ type: "Feature", geometry: r.geometry, properties: { mode: goMode } }] });
        // Show the whole route, clear of the panel at the bottom.
        const pts = r.geometry.coordinates as [number, number][];
        const lngs = pts.map((p) => p[0]), lats = pts.map((p) => p[1]);
        m?.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
          { padding: { top: 150, bottom: 400, left: 50, right: 70 }, maxZoom: 17, duration: 800 });
        setGoStatus("ready");
      } catch {
        if (!cancelled) setGoStatus("error");
      }
    };
    queueMicrotask(() => { if (!cancelled) { setGoRoute(null); setGoStatus("locating"); } });
    if (meRef.current) void route(meRef.current);
    else if (!navigator.geolocation) queueMicrotask(() => { if (!cancelled) setGoStatus("noLocation"); });
    else navigator.geolocation.getCurrentPosition(
      (pos) => { const p = { lat: pos.coords.latitude, lng: pos.coords.longitude }; setMe(p); void route(p); },
      () => { if (!cancelled) setGoStatus("noLocation"); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
    return () => { cancelled = true; ctrl.abort(); clearTimeout(timer); };
  }, [go, goMode, goTry]);

  // Start: follow the viewer along the way (the map keeps them in the middle).
  useEffect(() => {
    if (!following || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition((pos) => {
      const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setMe(p);
      map.current?.easeTo({ center: [p.lng, p.lat], zoom: Math.max(map.current.getZoom(), 16), duration: 600 });
    }, () => setFollowing(false), { enableHighAccuracy: true, maximumAge: 2000 });
    return () => navigator.geolocation.clearWatch(id);
  }, [following]);

  // A blue dot where the viewer is, once we know.
  useEffect(() => {
    const m = map.current;
    if (!ready || !m || !me) return;
    if (!meMarker.current) {
      const el = document.createElement("div");
      el.className = "h-4 w-4 rounded-full bg-blue-500 ring-4 ring-white shadow-[0_0_0_8px_rgba(59,130,246,0.25)]";
      el.setAttribute("aria-hidden", "true");
      meMarker.current = new Marker({ element: el }).setLngLat([me.lng, me.lat]).addTo(m);
    } else meMarker.current.setLngLat([me.lng, me.lat]);
  }, [me, ready]);

  // Distance left by road: the route length, scaled by how much of the straight line is left.
  const goRemaining = go && me ? (() => {
    const left = metres(me, go);
    const total = goRoute?.from ? metres(goRoute.from, go) : 0;
    return goRoute && total > 0 ? Math.min(goRoute.distance, goRoute.distance * (left / total)) : left;
  })() : null;

  // Search suggestions while the box is empty: places busy right now in this city (live first).
  const popular: SearchHit[] = useMemo(() => [...cityPlaces]
    .sort((a, b) => (b.source === "live" ? 1 : 0) - (a.source === "live" ? 1 : 0) || b.level - a.level)
    .slice(0, 5)
    .map((p) => ({ ...p, city_id: activeCity ?? "" })), [cityPlaces, activeCity]);

  // A map point picked in search (a shop, street, landmark or pin): fly there, mark it,
  // and show the same Directions / Uber card as a pin.
  const searchMarker = useRef<Marker | null>(null);
  function pickPoint(p: SearchPoint) {
    const m = map.current;
    if (!m) return;
    closeOthers();
    searchMarker.current?.remove();
    searchMarker.current = new Marker({ color: "#2563eb" }).setLngLat([p.lng, p.lat]).addTo(m);
    m.flyTo({ center: [p.lng, p.lat], zoom: Math.max(m.getZoom(), 16.5), essential: true });
    setPinPick({ id: `search:${p.lat},${p.lng}`, name: p.name, color: "#2563eb", lat: p.lat, lng: p.lng, at: Date.now() });
  }

  const cityNames = Object.fromEntries(cities.map((c) => [c.id, lang === "hi" && c.name_hi ? c.name_hi : c.name]));
  const activeFilters = countActive(filters);
  const liveCount = cityPlaces.filter((p) => p.source === "live" && !p.sample).length;
  const sampleCount = cityPlaces.filter((p) => p.source === "live" && p.sample).length;
  const toolBtn = (on: boolean) =>
    `relative shrink-0 rounded-full px-3.5 py-2 text-sm font-medium shadow ${on ? "bg-blue-600 text-white" : "bg-white text-gray-800 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-100"}`;

  const dockItems: { key: DockKey; label: string }[] = (["layers", "customize", "places", "tools"] as const)
    .map((k) => ({ key: k, label: tc(`dock.${k}`) }));
  const roundBtn = "grid h-10 w-10 place-items-center rounded-full bg-neutral-900/90 text-neutral-100 shadow-lg ring-1 ring-white/10 backdrop-blur hover:bg-neutral-800";

  return (
    <div ref={rootRef} className="relative flex-1 bg-neutral-950">
      {/* Inline style: MapLibre's CSS sets position: relative on this element. */}
      <div ref={box} style={{ position: "absolute", inset: 0 }} aria-label={t("mapLabel")} role="region" />
      <LoadingBar busy={!ready || !data || tilesLoading} label={t("loadingMap")} />
      {(!ready || !data) && (
        <div role="status" className="absolute inset-0 z-[5] grid place-items-center bg-gray-100/80 dark:bg-gray-900/80">
          <p className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm shadow dark:bg-gray-800">
            <span aria-hidden className="h-3 w-3 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            {t("loadingMap")}
          </p>
        </div>
      )}

      <div className="absolute inset-x-0 top-16 z-30 space-y-2 px-3">
        <div className="flex items-center gap-2">
          <SearchBox lang={lang} city={activeCity} cityNames={cityNames} onPick={(h: SearchHit) => openPlace(h)}
                     onPickPoint={pickPoint} center={centre} pins={markers} popular={popular} />
          {/* Phones: one menu button opens a popup with these. */}
          <button type="button" onClick={() => { closeOthers(); setPanel(null); setMobileMenu(true); }} aria-label={t("menu.open")} aria-haspopup="dialog"
                  className={`${toolBtn(mobileMenu)} sm:hidden`}>
            <Icon name="menu" size={18} />
            {activeFilters > 0 && <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-red-600 text-[11px] text-white">{activeFilters}</span>}
          </button>
          <button type="button" className={`${toolBtn(panel === "filters")} max-sm:hidden`} aria-expanded={panel === "filters"}
                  aria-label={activeFilters ? `${ts("filters")} (${activeFilters})` : ts("filters")}
                  onClick={() => { closeOthers(); setPanel(panel === "filters" ? null : "filters"); }}>
            <Icon name="filters" size={16} /> <span className="hidden sm:inline">{ts("filters")}</span>
            {activeFilters > 0 && (
              <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-red-600 text-[11px] text-white">{activeFilters}</span>
            )}
          </button>
          <button type="button" className={`${toolBtn(panel === "list")} max-sm:hidden`} aria-expanded={panel === "list"} aria-label={ts("list")}
                  onClick={() => { closeOthers(); setPanel(panel === "list" ? null : "list"); }}>
            <Icon name="list" size={16} /> <span className="hidden sm:inline">{ts("list")}</span>
          </button>
          <button type="button" className={`${toolBtn(adding)} max-sm:hidden`} aria-label={tp("addButton")}
                  onClick={() => { closeOthers(); setPanel(null); setAdding(true); }}>
            <Icon name="plus" size={16} /> <span className="hidden lg:inline">{tp("addButton")}</span>
          </button>
        </div>
        <div className="flex items-center gap-2">
          <CityPicker cities={cities.map((c) => ({ id: c.id, name: c.name, name_hi: c.name_hi, state: c.state ?? null }))}
                      active={activeCity} lang={lang} onPick={(id) => { const c = cities.find((x) => x.id === id); if (c) flyTo(c); }}
                      labels={{ pick: tc("city.pick"), search: tc("city.search"), none: tc("city.none") }} />
          {(quickCount > 0 || clearedPins) && (
            <button type="button" onClick={clearedPins ? undoClear : clearPins}
                    className="flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-sm font-medium text-gray-800 shadow hover:bg-gray-50 motion-safe:animate-[pop_160ms_ease-out] dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800">
              <Icon name={clearedPins ? "arrow_left" : "close"} size={14} />
              {clearedPins ? `${tc("pinsCleared")} · ${tc("undo")}` : `${tc("clearPins")} (${quickCount})`}
            </button>
          )}
        </div>
      </div>

      {/* Right edge: zoom slider at the top, round buttons at the bottom (above the dock).
          Moves left of the place panel when it's open. */}
      <div data-map-ui className={`pointer-events-none absolute right-2.5 top-[var(--legend-bottom,13.5rem)] z-10 flex flex-col items-end gap-2 print:hidden ${details ? "sm:right-[25.5rem]" : ""}`}>
        <div className={`pointer-events-auto flex flex-col items-end gap-2 ${details ? "hidden sm:flex" : ""}`}>
          <button type="button" onClick={() => setZoomOpen((o) => !o)} aria-expanded={zoomOpen} aria-label={tc("zoom")} title={tc("zoom")}
                  className={`${roundBtn} w-auto px-3 text-xs font-semibold tabular-nums`}>
            {zoom.toFixed(1)}
          </button>
          {(zoomOpen || zoomFlash) && (
            <div onPointerEnter={() => clearTimeout(zoomTimer.current)} onPointerLeave={() => { if (zoomFlash) flashZoom(); }}>
              <ZoomSlider value={zoom} onChange={(z, live) => { if (live) map.current?.jumpTo({ zoom: z }); else map.current?.easeTo({ zoom: z, duration: 300 }); }}
                          labels={{ zoom: tc("zoom"), zoomIn: tc("zoomIn"), zoomOut: tc("zoomOut"), slider: tc("zoomSlider") }} />
            </div>
          )}
        </div>
      </div>

      {/* Bottom-right corner: compass, share location, locate, full screen. */}
      <div data-map-ui className={`pointer-events-none absolute bottom-3 right-3 z-20 flex flex-col items-end print:hidden ${details ? "sm:right-[25.5rem]" : ""}`}>
        <div className="pointer-events-auto flex flex-col items-end gap-2">
        {(Math.abs(bearing) > 0.5 || pitch > 0.5) && (
          <button type="button" onClick={() => map.current?.resetNorthPitch({ duration: 500 })} title={tc("resetNorth")} aria-label={tc("resetNorth")} className={roundBtn}>
            <span aria-hidden style={{ transform: `rotate(${-bearing}deg)` }} className="transition-transform"><Icon name="compass" size={18} /></span>
          </button>
        )}
        {locError && panel !== "filters" && <p className="max-w-56 rounded-md bg-neutral-900 px-2 py-1 text-xs text-neutral-100 shadow">{locError}</p>}
        <button type="button" onClick={toggleSharing} aria-pressed={sharing} title={t(sharing ? "shareOn" : "share")}
                aria-label={t(sharing ? "shareOn" : "share")}
                className={sharing ? "grid h-10 w-10 place-items-center rounded-full bg-blue-600 text-white shadow-lg ring-4 ring-blue-400/40" : roundBtn}>
          <Icon name="live" size={18} />
        </button>
        <button type="button" onClick={() => void withLocation("locate", () => locate())} title={t("locate")}
                className={roundBtn}>
          <Icon name="locate" size={18} /><span className="sr-only">{t("locate")}</span>
        </button>
        <button type="button" onClick={toggleFullscreen} className={`${roundBtn} hidden w-auto px-3 text-xs font-medium sm:grid`} aria-pressed={fullscreen}>
          {fullscreen ? tc("exitFullscreen") : tc("fullscreen")}
        </button>
        </div>
      </div>

      {sharing && presence.state !== "off" && (
        <div role="status" aria-live="polite"
             className="absolute bottom-[4.75rem] left-1/2 z-20 flex max-w-[90%] -translate-x-1/2 items-center gap-2 rounded-full bg-blue-600 px-3.5 py-1.5 text-xs text-white shadow-lg print:hidden">
          <span aria-hidden className="h-2 w-2 animate-pulse rounded-full bg-white" />
          <span className="truncate">
            {presence.state === "starting" && t("presence.starting")}
            {presence.state === "on" && (presence.placeName
              ? t("presence.on", { place: presence.placeName, n: presence.here })
              : t("presence.onNowhere"))}
            {presence.state === "error" && t(presence.reason)}
          </span>
          <button type="button" onClick={toggleSharing} className="rounded-full bg-white/20 px-2 py-0.5 font-medium hover:bg-white/30">
            {t("stop")}
          </button>
        </div>
      )}

      {/* Someone nearby reported a crowd level: ask people who are there to confirm it. */}
      <ConfirmPrompt lang={lang} me={me} onLocated={setMe} hidden={!!selected || !!go || !!dockPanel || !!panel || adding}
                     onConfirmed={() => { if (activeCity) void loadCity(activeCity, true); }} />

      <Legend lang={lang} shown={visible.length} places={cityPlaces.length} live={liveCount} sample={sampleCount} />

      {newMarker && (
        <div data-map-ui className="absolute z-40 print:hidden"
             style={{ left: Math.min(Math.max(newMarker.x - 128, 8), newMarker.w - 264), top: Math.max(newMarker.y - 210, 8) }}>
          <NewMarkerForm lang={lang} color={prefs.drawColor} onSave={saveMarker} onCancel={() => setNewMarker(null)} />
        </div>
      )}

      {dockPanel === "layers" && (
        <LayersPanel lang={lang} basemap={basemap} onBasemap={setBasemap} overlays={overlays}
                     onOverlay={(id, on) => setOverlays((o) => ({ ...o, [id]: on }))} onClose={() => setDockPanel(null)} />
      )}
      {dockPanel === "customize" && (
        <CustomizePanel lang={lang} prefs={prefs} contoursOn={overlays.contours}
                        siteTheme={siteTheme} onTheme={(th) => { setSiteTheme(th); setPalette(th); }}
                        onPrefs={(p) => { if (p.palette) setPalette(p.palette); else setPrefs((cur) => ({ ...cur, ...p })); }}
                        onSave={() => savePrefs(prefs)}
                        onReset={() => { clearPrefs(); setPrefs(DEFAULT_PREFS); if (basemap === "dark") setBasemap("street"); }}
                        onClose={() => setDockPanel(null)} />
      )}
      {dockPanel === "places" && (
        <PlacesPanel lang={lang} markers={markers} onDelete={deleteMarker} onClose={() => setDockPanel(null)}
                     onOpen={(mk) => { setOverlays((o) => ({ ...o, saved: true })); map.current?.flyTo({ center: [mk.lng, mk.lat], zoom: Math.max(map.current.getZoom(), 16), essential: true }); }} />
      )}
      {dockPanel === "tools" && (
        <ToolsPanel lang={lang} mode={toolMode} onMode={chooseTool} measurePts={measurePts} onClearMeasure={() => setMeasurePts([])}
                    drawPts={drawPts} onFinishDraw={finishDrawing} shapes={shapes} onDeleteShape={deleteShape}
                    onExport={exportPng} onShare={copyShareLink} onPrint={printView} onClose={() => setDockPanel(null)} />
      )}

      <MapDock items={dockItems} label={tc("dock.label")}
               active={dockPanel} onPick={pickDock} shift={!!selected && details} />

      {panel === "list" && (
        <PlaceList key={`${activeCity}-${JSON.stringify(filters)}`} lang={lang} items={visible}
                   total={cityPlaces.length} onPick={(p) => openPlace(p)} onClose={() => setPanel(null)} />
      )}
      {panel === "filters" && (
        <FilterSheet lang={lang} filters={filters} onChange={setFilters} onClose={() => setPanel(null)}
                     origin={me ? "me" : "centre"} onUseLocation={() => locate(false)} locError={locError} />
      )}

      {adding && (
        <AddPlaceSheet lang={lang} onClose={closeAdding}
                       onLocated={(f) => showNewPin(f.lat, f.lng)}
                       onOpenPlace={(id) => { closeAdding(); selectPlace(id); }}
                       onAdded={(p) => {
                         closeAdding();
                         if (p.cityId !== activeCity) setActiveCity(p.cityId); else void loadCity(p.cityId, true);
                         selectPlace(p.id);
                         map.current?.flyTo({ center: [p.lng, p.lat], zoom: 17, essential: true });
                       }} />
      )}

      {pinPick && !go && !selected && (
        <section data-map-ui aria-label={pinPick.name || tc("unnamed")}
                 className="absolute inset-x-2 bottom-[4.75rem] z-40 rounded-2xl bg-neutral-950/95 p-4 text-sm text-neutral-200 shadow-2xl ring-1 ring-white/10 backdrop-blur motion-safe:animate-[pop_180ms_ease-out] print:hidden sm:inset-x-0 sm:mx-auto sm:w-[340px]">
          <div className="mb-3 flex items-center gap-3">
            <span className="h-3.5 w-3.5 shrink-0 rounded-full ring-2 ring-white" style={{ background: pinPick.color }} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-white">{pinPick.name || tc("unnamed")}</p>
              <p className="text-xs text-neutral-500">{pinPick.lat.toFixed(5)}, {pinPick.lng.toFixed(5)}{me ? ` · ${(metres(me, pinPick) / 1000).toFixed(1)} km` : ""}</p>
            </div>
            <button type="button" onClick={() => {
                      if (pinPick.id.startsWith("search:")) { searchMarker.current?.remove(); searchMarker.current = null; }
                      else deleteMarker(pinPick.id);
                      setPinPick(null);
                    }} title={t("pin.delete")} aria-label={t("pin.delete")}
                    className="grid h-8 w-8 place-items-center rounded-full text-neutral-400 hover:bg-neutral-800 hover:text-red-400"><Icon name="close" size={16} /></button>
          </div>
          <GoButtons dest={{ lat: pinPick.lat, lng: pinPick.lng, name: pinPick.name || tc("unnamed") }} from={me} lang={lang}
                     onGo={() => goTo({ lat: pinPick.lat, lng: pinPick.lng, name: pinPick.name || tc("unnamed") })} />
        </section>
      )}
      {go && !selected && (
        <GoPanel dest={go} lang={lang} mode={goMode} onMode={(md) => { setFollowing(false); setGoMode(md); }} status={goStatus}
                 distance={goRoute?.distance ?? null} duration={goRoute?.duration ?? null}
                 remaining={goRemaining} following={following} onFollow={() => setFollowing((f) => !f)} from={me}
                 onClose={stopGo} onRetry={() => setGoTry((n) => n + 1)} />
      )}

      {selected && !details && (
        <div data-map-ui className="pointer-events-none absolute inset-x-0 top-[6.5rem] bottom-[4.5rem] z-30 flex items-center justify-center print:hidden sm:top-24">
          <div className="pointer-events-auto">
            <PlaceCard placeId={selected} lang={lang} me={me} onGo={goTo}
                       onClose={() => setSelected(null)} onMore={() => setDetails(true)} />
          </div>
        </div>
      )}
      {mobileMenu && (
        <div className="fixed inset-0 z-[65] flex items-end bg-black/40 backdrop-blur-[2px] sm:hidden" onClick={() => setMobileMenu(false)}>
          <section role="dialog" aria-modal="true" aria-label={t("menu.title")} onClick={(e) => e.stopPropagation()}
                   className="w-full rounded-t-3xl bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 text-zinc-800 shadow-2xl motion-safe:animate-[sheetup_220ms_ease-out] dark:bg-zinc-900 dark:text-zinc-100">
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-zinc-300 dark:bg-zinc-700" />
            <div className="grid grid-cols-3 gap-2">
              {([
                ["filters", ts("filters"), () => setPanel("filters")],
                ["list", ts("list"), () => setPanel("list")],
                ["plus", tp("addButton"), () => setAdding(true)],
                ["live", t(sharing ? "shareOn" : "share"), () => toggleSharing()],
                ["locate", t("locate"), () => void withLocation("locate", () => locate())],
                ["layers", tc("dock.layers"), () => setDockPanel("layers")],
              ] as const).map(([icon, label, run]) => (
                <button key={icon} type="button" onClick={() => { setMobileMenu(false); run(); }}
                        className={`flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3.5 text-xs font-medium active:scale-95 ${icon === "live" && sharing ? "bg-blue-600 text-white" : "bg-zinc-100 dark:bg-zinc-800"}`}>
                  <Icon name={icon} size={22} />
                  <span className="line-clamp-2 text-center leading-tight">{label}</span>
                </button>
              ))}
            </div>
            {(quickCount > 0 || clearedPins) && (
              <button type="button" onClick={() => { setMobileMenu(false); if (clearedPins) undoClear(); else clearPins(); }}
                      className="mt-2 w-full rounded-2xl bg-zinc-100 py-3 text-sm font-medium dark:bg-zinc-800">
                {clearedPins ? `${tc("pinsCleared")} · ${tc("undo")}` : `${tc("clearPins")} (${quickCount})`}
              </button>
            )}
          </section>
        </div>
      )}
      {locAsk && (
        <LocationAsk lang={lang} reason={locAsk.reason} blocked={locAsk.blocked}
                     onAllow={() => { const r = locAsk.run; setLocAsk(null); r(); }}
                     onClose={() => { const n = locAsk.onNo; setLocAsk(null); n?.(); }} />
      )}
      {selected && details && (
        <PlaceSheet key={selected} placeId={selected} version={placeVersion} lang={lang}
                    onClose={() => { setDetails(false); setSelected(null); }}
                    onChanged={() => activeCity && void loadCity(activeCity, true)} onGo={goTo} />
      )}
    </div>
  );
}

function Legend({ lang, shown, places, live, sample }: { lang: Language; shown: number; places: number; live: number; sample: number }) {
  const t = translator(messages, lang);
  // The zoom and location buttons start just below the legend, however tall it gets.
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    const place = () => parent.style.setProperty("--legend-bottom", `${el.offsetTop + el.offsetHeight + 10}px`);
    place();
    const ro = new ResizeObserver(place);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} data-map-ui className="absolute right-3 top-[8.75rem] z-10 max-w-[15rem] rounded-xl bg-neutral-950/90 px-3 py-2 text-xs text-neutral-200 shadow-lg ring-1 ring-white/10 backdrop-blur print:top-3">
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {config.crowd.levels.map((l) => (
          <span key={l.level} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: l.color }} />{t(`level.${l.key}`)}
          </span>
        ))}
      </div>
      {places > 0 && (
        <p className="mt-1 hidden text-[11px] text-gray-500 sm:block">
          {shown < places ? t("legend.filtered", { shown, places, live }) : t("legend.counts", { places, live })}
        </p>
      )}
      {sample > 0 && (
        <p className="mt-0.5 flex items-center gap-1.5 text-[11px] font-medium text-amber-600">
          <span className="h-2.5 w-2.5 rounded-full border-2 border-amber-500" />{t("legend.sample", { n: sample })}
        </p>
      )}
    </div>
  );
}
