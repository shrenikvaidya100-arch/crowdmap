"use client";
import { Icon } from "@/components/icons/Icon";
import { iconSvg } from "@/components/icons/Icon";
// Live crowd map: OpenStreetMap (via OpenFreeMap) with each place coloured by
// its crowd level. Solid = live from reports, faded = estimated. Search,
// filters and a sortable list sit on top. User 1 feature.
import "maplibre-gl/dist/maplibre-gl.css";
import {
  Map as MLMap, Marker, ScaleControl, setWorkerUrl,
  type GeoJSONSource, type MapLayerMouseEvent, type MapMouseEvent,
} from "maplibre-gl";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { preconnect } from "react-dom";
import { crowdConfig, quickIcon } from "@/features/crowd/config";
import { PlaceSheet } from "@/features/crowd/PlaceSheet";
import { loadPresencePreference, savePresencePreference, usePresence } from "@/features/crowd/usePresence";
import { AddPlaceSheet } from "@/features/places/AddPlaceSheet";
import { messages as placeMessages } from "@/features/places/messages";
import { FilterSheet, PlaceList } from "@/features/search/Explore";
import { applyFilters, countActive, DEFAULT_FILTERS, type Filters } from "@/features/search/filters";
import { messages as searchMessages } from "@/features/search/messages";
import { SearchBox, type SearchHit } from "@/features/search/SearchBox";
import { config, type Language } from "@/lib/config";
import { translator } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { messages } from "./messages";
import { useCityUpdates } from "./useCityUpdates";
import { DEFAULT_OVERLAYS, styleUrl, type BasemapId, type OverlayId } from "./basemaps";
import { applyOverlays, carryOver, DEFAULT_PREFS, paletteFilter, type MapPrefs } from "./mapLayers";
import { MapDock, type DockKey } from "./controls/MapDock";
import { CustomizePanel, LayersPanel, NewMarkerForm, PlacesPanel, ToolsPanel, type ToolMode } from "./controls/MapPanels";
import { messages as controlMessages } from "./controls/messages";
import { clearPrefs, loadMarkers, loadPrefs, loadShapes, newId, saveMarkers, savePrefs, saveShapes, type Shape, type UserMarker } from "./controls/store";
import { ZoomSlider } from "./controls/ZoomSlider";
import { PlaceCard } from "./PlaceCard";

// Worker file is copied into public/ by scripts/copy-map-worker.mjs.
setWorkerUrl("/maplibre-gl-worker.js");

const TILE_ORIGIN = new URL(config.map.styleUrl).origin;

export type MapCity = { id: string; name: string; name_hi: string | null; lat: number; lng: number; default_zoom: number };
/** Kept for the home page's props; places are now loaded per city from /api/crowd. */
export type MapPlace = { id: string; name: string; name_hi: string | null; category: string; lat: number; lng: number; city_id: string };

type CrowdPlace = {
  id: string; name: string; name_hi: string | null; category: string; lat: number; lng: number;
  level: number; source: "live" | "estimated"; reports: number; status?: "listed" | "unconfirmed"; here?: number; sample?: boolean;
};
type Alert = { id: string; kind: string; place_id: string | null; lat: number; lng: number };
type CrowdData = { city: string; places: CrowdPlace[]; alerts: Alert[] };
type LatLng = { lat: number; lng: number };

const LEVEL_COLOR = ["match", ["get", "level"],
  ...config.crowd.levels.flatMap((l) => [l.level, l.color]), config.crowd.noDataColor] as unknown as string;

/** A place to open on load (from /?place=<id>). */
export type LinkedPlace = { id: string; lat: number; lng: number; city_id: string };

export function MapView({ lang, cities, initialPlace = null, initialFocus = null }: {
  lang: Language; cities: MapCity[]; places?: MapPlace[]; initialPlace?: LinkedPlace | null;
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
  useEffect(() => { queueMicrotask(() => setSharing(loadPresencePreference())); }, []);
  function toggleSharing() {
    setSharing((on) => { savePresencePreference(!on); return !on; });
  }
  const startCity = cities.find((c) => c.id === (initialPlace?.city_id ?? config.defaultCity)) ?? cities[0] ?? null;
  const [ready, setReady] = useState(false);
  const [activeCity, setActiveCity] = useState<string | null>(startCity?.id ?? null);
  const [data, setData] = useState<CrowdData | null>(null);
  const [selected, setSelected] = useState<string | null>(initialPlace?.id ?? null);
  // The picked place shows as a flip card; "More details" opens the full panel.
  const [details, setDetails] = useState(false);
  const [cardFocus, setCardFocus] = useState(0);
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
      attributionControl: { compact: true },
      // Double tap drops a pin instead of zooming.
      doubleClickZoom: false,
    });
    map.current = m;
    m.addControl(new ScaleControl({ maxWidth: 100, unit: "metric" }), "bottom-left");
    m.on("moveend", () => { const c = m.getCenter(); setCentre({ lat: c.lat, lng: c.lng }); });
    let raf = 0;
    const sync = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => { setZoom(m.getZoom()); setBearing(m.getBearing()); setPitch(m.getPitch()); });
    };
    m.on("move", sync);
    m.on("movestart", () => setNewMarker(null));
    m.on("style.load", () => setStyleVersion((v) => v + 1));
    m.on("click", (e: MapMouseEvent) => {
      const pt: [number, number] = [e.lngLat.lng, e.lngLat.lat];
      const mode = toolRef.current;
      if (mode === "measure") { setMeasurePts((p) => [...p, pt]); return; }
      if (mode === "point") { setDrawPts([pt]); return; }
      if (mode === "line" || mode === "area") { setDrawPts((p) => [...p, pt]); return; }
      // Clicks on a place open the place; a tap on an empty spot closes everything.
      if (m.getLayer("places") && m.queryRenderedFeatures(e.point, { layers: ["places"] }).length) return;
      selectPlace(null); setPanel(null); setDockPanel(null); setNewMarker(null);
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
    m.on("load", () => {
      m.addSource("places", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      // Blue halo where CrowdMap users are right now (drawn under the dots).
      m.addLayer({
        id: "presence",
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
        id: "places",
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
      m.on("mouseenter", "places", () => { m.getCanvas().style.cursor = "pointer"; });
      m.on("mouseleave", "places", () => { m.getCanvas().style.cursor = ""; });
      setReady(true);
    });
    return () => { cancelAnimationFrame(raf); m.remove(); map.current = null; };
    // The map is created once; data updates are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadCity = useCallback(async (city: string) => {
    try {
      const res = await fetch(`/api/crowd?city=${encodeURIComponent(city)}`, { cache: "no-store" });
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
    if (activeCity) void loadCity(activeCity);
    if (selected && ids.has(selected)) setPlaceVersion((v) => v + 1);
  });

  // Places that pass the filters, sorted; distances from me, or else the map centre.
  const cityPlaces = useMemo(() => (data && data.city === activeCity ? data.places : []), [data, activeCity]);
  const visible = useMemo(() => applyFilters(cityPlaces, filters, me ?? centre), [cityPlaces, filters, me, centre]);

  // Push the visible places and alerts into the map.
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    (m.getSource("places") as GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: visible.map((p) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [p.lng, p.lat] },
        properties: {
          id: p.id, level: p.level, live: p.source === "live" ? 1 : 0,
          unconfirmed: p.status === "unconfirmed" ? 1 : 0, here: p.here ?? 0, sample: p.sample ? 1 : 0,
        },
      })),
    });
  }, [visible, ready, styleVersion]);

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
    if (basemap === "3d") m.easeTo({ pitch: 60, bearing: -20, zoom: Math.max(m.getZoom(), 15.5), duration: 900 });
    else if (was === "3d" || basemap !== "terrain") { if (m.getPitch() > 0) m.easeTo({ pitch: 0, duration: 600 }); }
    if (basemap === "terrain") m.easeTo({ pitch: 55, duration: 900 });
  }, [basemap, ready]);

  // Overlays, label and dot size, opacity: after every style load and on change.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready || !m.isStyleLoaded()) return;
    applyOverlays(m, basemap, overlays, prefs);
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

  // Keyboard shortcuts (not while typing): + - zoom, arrows pan, L layers, T tools, ? help, Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest('input, textarea, select, [contenteditable="true"], [role="slider"]') || e.metaKey || e.ctrlKey || e.altKey) return;
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
      else if (e.key === "l" || e.key === "L") setDockPanel((p) => (p === "layers" ? null : "layers"));
      else if (e.key === "t" || e.key === "T" || e.key === "?") setDockPanel((p) => (p === "tools" ? null : "tools"));
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
    if (k === "map") {
      setDockPanel(null); setToolMode(null);
      const c = cities.find((x) => x.id === activeCity);
      if (c) map.current?.flyTo({ center: [c.lng, c.lat], zoom: c.default_zoom, pitch: 0, bearing: 0, essential: true });
      return;
    }
    setDockPanel((p) => (p === k ? null : k));
  }

  function dropPin(lat: number, lng: number) {
    setMarkers((prev) => {
      const next = [{ id: newId(), name: `${tc("pin")} ${prev.length + 1}`, color: prefsRef.current.drawColor, lat, lng, at: Date.now() }, ...prev];
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
  function closeOthers() { setDockPanel(null); setSelected(null); setDetails(false); setAdding(false); setNewMarker(null); }

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

  const cityNames = Object.fromEntries(cities.map((c) => [c.id, lang === "hi" && c.name_hi ? c.name_hi : c.name]));
  const activeFilters = countActive(filters);
  const liveCount = cityPlaces.filter((p) => p.source === "live" && !p.sample).length;
  const sampleCount = cityPlaces.filter((p) => p.source === "live" && p.sample).length;
  const toolBtn = (on: boolean) =>
    `relative shrink-0 rounded-full px-3.5 py-2 text-sm font-medium shadow ${on ? "bg-blue-600 text-white" : "bg-white text-gray-800 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-100"}`;

  const dockItems: { key: DockKey; label: string }[] = (["map", "layers", "customize", "places", "tools"] as const)
    .map((k) => ({ key: k, label: tc(`dock.${k}`) }));
  const roundBtn = "grid h-10 w-10 place-items-center rounded-full bg-neutral-900/90 text-neutral-100 shadow-lg ring-1 ring-white/10 backdrop-blur hover:bg-neutral-800";

  return (
    <div ref={rootRef} className="relative flex-1 bg-neutral-950">
      {/* Inline style: MapLibre's CSS sets position: relative on this element. */}
      <div ref={box} style={{ position: "absolute", inset: 0 }} aria-label={t("mapLabel")} role="region" />
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
          <SearchBox lang={lang} city={activeCity} cityNames={cityNames} onPick={(h: SearchHit) => openPlace(h)} />
          <button type="button" className={toolBtn(panel === "filters")} aria-expanded={panel === "filters"}
                  aria-label={activeFilters ? `${ts("filters")} (${activeFilters})` : ts("filters")}
                  onClick={() => { closeOthers(); setPanel(panel === "filters" ? null : "filters"); }}>
            <Icon name="filters" size={16} /> <span className="hidden sm:inline">{ts("filters")}</span>
            {activeFilters > 0 && (
              <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-red-600 text-[11px] text-white">{activeFilters}</span>
            )}
          </button>
          <button type="button" className={toolBtn(panel === "list")} aria-expanded={panel === "list"} aria-label={ts("list")}
                  onClick={() => { closeOthers(); setPanel(panel === "list" ? null : "list"); }}>
            <Icon name="list" size={16} /> <span className="hidden sm:inline">{ts("list")}</span>
          </button>
          <button type="button" className={toolBtn(adding)} aria-label={tp("addButton")}
                  onClick={() => { closeOthers(); setPanel(null); setAdding(true); }}>
            <Icon name="plus" size={16} /> <span className="hidden lg:inline">{tp("addButton")}</span>
          </button>
        </div>
        <div className="flex gap-2 overflow-x-auto [scrollbar-width:none]">
          {cities.map((c) => (
            <button key={c.id} type="button" onClick={() => flyTo(c)}
                    className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium shadow ${activeCity === c.id ? "bg-blue-600 text-white" : "bg-white text-gray-800 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-100"}`}>
              {cityNames[c.id]}
            </button>
          ))}
        </div>
      </div>

      {/* Right edge: zoom slider at the top, round buttons at the bottom (above the dock).
          Moves left of the place panel when it's open. */}
      <div data-map-ui className={`pointer-events-none absolute bottom-[5.25rem] right-2.5 top-[13.5rem] z-10 flex flex-col items-end justify-between gap-2 print:hidden ${details ? "sm:right-[25.5rem]" : ""}`}>
        <div className={`pointer-events-auto flex flex-col items-end gap-2 ${details ? "hidden sm:flex" : ""}`}>
          <button type="button" onClick={() => setZoomOpen((o) => !o)} aria-expanded={zoomOpen} aria-label={tc("zoom")} title={tc("zoom")}
                  className={`${roundBtn} w-auto px-3 text-xs font-semibold tabular-nums`}>
            {zoom.toFixed(1)}
          </button>
          {(zoomOpen || zoomFlash) && (
            <div onPointerEnter={() => clearTimeout(zoomTimer.current)} onPointerLeave={() => { if (zoomFlash) flashZoom(); }}>
              <ZoomSlider value={zoom} onChange={(z) => map.current?.easeTo({ zoom: z, duration: 250 })}
                          labels={{ zoom: tc("zoom"), zoomIn: tc("zoomIn"), zoomOut: tc("zoomOut"), slider: tc("zoomSlider") }} />
            </div>
          )}
        </div>
        <div className="pointer-events-auto flex flex-col items-end gap-2">
        {(Math.abs(bearing) > 0.5 || pitch > 0.5) && (
          <button type="button" onClick={() => map.current?.resetNorthPitch({ duration: 500 })} title={tc("resetNorth")} aria-label={tc("resetNorth")} className={roundBtn}>
            <span aria-hidden style={{ transform: `rotate(${-bearing}deg)` }} className="transition-transform"><Icon name="compass" size={18} /></span>
          </button>
        )}
        <button type="button" onClick={toggleFullscreen} className={`${roundBtn} hidden w-auto px-3 text-xs font-medium sm:grid`} aria-pressed={fullscreen}>
          {fullscreen ? tc("exitFullscreen") : tc("fullscreen")}
        </button>
        {locError && panel !== "filters" && <p className="max-w-56 rounded-md bg-neutral-900 px-2 py-1 text-xs text-neutral-100 shadow">{locError}</p>}
        <button type="button" onClick={toggleSharing} aria-pressed={sharing} title={t(sharing ? "shareOn" : "share")}
                aria-label={t(sharing ? "shareOn" : "share")}
                className={sharing ? "grid h-10 w-10 place-items-center rounded-full bg-blue-600 text-white shadow-lg ring-4 ring-blue-400/40" : roundBtn}>
          <Icon name="live" size={18} />
        </button>
        <button type="button" onClick={() => locate()} title={t("locate")}
                className={roundBtn}>
          <Icon name="locate" size={18} /><span className="sr-only">{t("locate")}</span>
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
                        onPrefs={(p) => { if (p.palette === "light" || p.palette === "dark") setSiteTheme(p.palette); else if (p.palette) setPalette(p.palette); else setPrefs((cur) => ({ ...cur, ...p })); }}
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
                         if (p.cityId !== activeCity) setActiveCity(p.cityId); else void loadCity(p.cityId);
                         selectPlace(p.id);
                         map.current?.flyTo({ center: [p.lng, p.lat], zoom: 17, essential: true });
                       }} />
      )}

      {selected && !details && (
        <div data-map-ui className="pointer-events-none absolute inset-x-0 top-[6.5rem] bottom-[4.5rem] z-30 flex items-center justify-center print:hidden sm:top-24">
          <div className="pointer-events-auto">
            <PlaceCard placeId={selected} lang={lang} restoreFocus={cardFocus}
                       onClose={() => setSelected(null)} onMore={() => setDetails(true)} />
          </div>
        </div>
      )}
      {selected && details && (
        <PlaceSheet key={selected} placeId={selected} version={placeVersion} lang={lang}
                    onClose={() => { setDetails(false); setCardFocus((n) => n + 1); }}
                    onChanged={() => activeCity && void loadCity(activeCity)} />
      )}
    </div>
  );
}

function Legend({ lang, shown, places, live, sample }: { lang: Language; shown: number; places: number; live: number; sample: number }) {
  const t = translator(messages, lang);
  return (
    <div data-map-ui className="absolute right-3 top-[8.75rem] z-10 max-w-[15rem] rounded-xl bg-neutral-950/90 px-3 py-2 text-xs text-neutral-200 shadow-lg ring-1 ring-white/10 backdrop-blur print:top-3">
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {config.crowd.levels.map((l) => (
          <span key={l.level} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: l.color }} />{t(`level.${l.key}`)}
          </span>
        ))}
      </div>
      {places > 0 && (
        <p className="mt-1 text-[11px] text-gray-500">
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
