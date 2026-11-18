"use client";
// Live crowd map: OpenStreetMap (via OpenFreeMap) with each place coloured by
// its crowd level. Solid = live from reports, faded = estimated. Search,
// filters and a sortable list sit on top. User 1 feature.
import "maplibre-gl/dist/maplibre-gl.css";
import {
  Map as MLMap, Marker, NavigationControl, setWorkerUrl,
  type GeoJSONSource, type MapLayerMouseEvent,
} from "maplibre-gl";
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
import { messages } from "./messages";
import { useCityUpdates } from "./useCityUpdates";

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

export function MapView({ lang, cities, initialPlace = null }: { lang: Language; cities: MapCity[]; places?: MapPlace[]; initialPlace?: LinkedPlace | null }) {
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
  const [panel, setPanel] = useState<"filters" | "list" | null>(null);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [me, setMe] = useState<LatLng | null>(null);
  const [centre, setCentre] = useState<LatLng | null>(startCity ? { lat: startCity.lat, lng: startCity.lng } : null);
  const [locError, setLocError] = useState("");

  // Create the map once.
  useEffect(() => {
    if (!box.current) return;
    const m = new MLMap({
      container: box.current,
      style: config.map.styleUrl,
      center: initialPlace ? [initialPlace.lng, initialPlace.lat] : startCity ? [startCity.lng, startCity.lat] : config.map.worldCenter,
      zoom: initialPlace ? 16 : startCity ? startCity.default_zoom : config.map.worldZoom,
      attributionControl: { compact: true },
    });
    map.current = m;
    m.addControl(new NavigationControl({ showCompass: false }), "bottom-right");
    m.on("moveend", () => { const c = m.getCenter(); setCentre({ lat: c.lat, lng: c.lng }); });
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
      m.on("click", "places", (e: MapLayerMouseEvent) => {
        const id = e.features?.[0]?.properties?.id;
        if (typeof id === "string") setSelected(id);
      });
      m.on("mouseenter", "places", () => { m.getCanvas().style.cursor = "pointer"; });
      m.on("mouseleave", "places", () => { m.getCanvas().style.cursor = ""; });
      setReady(true);
    });
    return () => { m.remove(); map.current = null; };
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
  }, [visible, ready]);

  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    alertMarkers.current.forEach((mk) => mk.remove());
    alertMarkers.current = (data?.alerts ?? []).map((a) => {
      const el = document.createElement("button");
      el.type = "button";
      el.textContent = quickIcon(a.kind);
      el.className = "grid h-7 w-7 place-items-center rounded-full bg-white text-base shadow-md ring-2 ring-amber-400";
      el.setAttribute("aria-label", a.kind.replace("_", " "));
      if (a.place_id) el.addEventListener("click", (ev) => { ev.stopPropagation(); setSelected(a.place_id); });
      return new Marker({ element: el, offset: [12, -12] }).setLngLat([a.lng, a.lat]).addTo(m);
    });
  }, [data, ready]);

  function flyTo(c: MapCity) {
    setActiveCity(c.id);
    setSelected(null);
    map.current?.flyTo({ center: [c.lng, c.lat], zoom: c.default_zoom, essential: true });
  }

  /** Centre on a place (switching city if needed) and open its panel. */
  function openPlace(p: { id: string; lat: number; lng: number; city_id?: string }) {
    if (p.city_id && p.city_id !== activeCity) setActiveCity(p.city_id);
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

  return (
    <div className="relative flex-1">
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

      <div className="absolute inset-x-0 top-0 z-30 space-y-2 p-3">
        <div className="flex items-center gap-2">
          <SearchBox lang={lang} city={activeCity} cityNames={cityNames} onPick={(h: SearchHit) => openPlace(h)} />
          <button type="button" className={toolBtn(panel === "filters")} aria-expanded={panel === "filters"}
                  aria-label={activeFilters ? `${ts("filters")} (${activeFilters})` : ts("filters")}
                  onClick={() => setPanel(panel === "filters" ? null : "filters")}>
            <span aria-hidden>⚙︎</span> <span className="hidden sm:inline">{ts("filters")}</span>
            {activeFilters > 0 && (
              <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-red-600 text-[11px] text-white">{activeFilters}</span>
            )}
          </button>
          <button type="button" className={toolBtn(panel === "list")} aria-expanded={panel === "list"} aria-label={ts("list")}
                  onClick={() => setPanel(panel === "list" ? null : "list")}>
            <span aria-hidden>☰</span> <span className="hidden sm:inline">{ts("list")}</span>
          </button>
          <button type="button" className={toolBtn(adding)} aria-label={tp("addButton")}
                  onClick={() => { setSelected(null); setPanel(null); setAdding(true); }}>
            <span aria-hidden>＋</span> <span className="hidden lg:inline">{tp("addButton")}</span>
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

      <div className="absolute bottom-36 right-2.5 z-10 flex flex-col items-end gap-2 sm:bottom-28">
        {locError && panel !== "filters" && <p className="max-w-56 rounded-md bg-white px-2 py-1 text-xs shadow dark:bg-gray-900">{locError}</p>}
        <button type="button" onClick={toggleSharing} aria-pressed={sharing} title={t(sharing ? "shareOn" : "share")}
                aria-label={t(sharing ? "shareOn" : "share")}
                className={`grid h-10 w-10 place-items-center rounded-full text-lg shadow ${sharing ? "bg-blue-600 text-white ring-4 ring-blue-300/50" : "bg-white hover:bg-gray-50 dark:bg-gray-900"}`}>
          <span aria-hidden>📡</span>
        </button>
        <button type="button" onClick={() => locate()} title={t("locate")}
                className="grid h-10 w-10 place-items-center rounded-full bg-white text-lg shadow hover:bg-gray-50 dark:bg-gray-900">
          <span aria-hidden>◎</span><span className="sr-only">{t("locate")}</span>
        </button>
      </div>

      {sharing && presence.state !== "off" && (
        <div role="status" aria-live="polite"
             className="absolute bottom-24 left-1/2 z-20 flex max-w-[90%] -translate-x-1/2 items-center gap-2 rounded-full bg-blue-600 px-3.5 py-1.5 text-xs text-white shadow-lg sm:bottom-20">
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
                       onOpenPlace={(id) => { closeAdding(); setSelected(id); }}
                       onAdded={(p) => {
                         closeAdding();
                         if (p.cityId !== activeCity) setActiveCity(p.cityId); else void loadCity(p.cityId);
                         setSelected(p.id);
                         map.current?.flyTo({ center: [p.lng, p.lat], zoom: 17, essential: true });
                       }} />
      )}

      {selected && (
        <PlaceSheet key={selected} placeId={selected} version={placeVersion} lang={lang} onClose={() => setSelected(null)}
                    onChanged={() => activeCity && void loadCity(activeCity)} />
      )}
    </div>
  );
}

function Legend({ lang, shown, places, live, sample }: { lang: Language; shown: number; places: number; live: number; sample: number }) {
  const t = translator(messages, lang);
  return (
    <div className="absolute bottom-3 left-3 z-10 max-w-[calc(100%-5rem)] rounded-lg bg-white/95 px-3 py-2 text-xs shadow dark:bg-gray-900/95">
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
