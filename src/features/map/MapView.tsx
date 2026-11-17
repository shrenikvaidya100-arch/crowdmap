"use client";
// Live crowd map: OpenStreetMap (via OpenFreeMap) with each place coloured by
// its crowd level. Solid = live from reports, faded = estimated. User 1 feature.
import "maplibre-gl/dist/maplibre-gl.css";
import {
  Map as MLMap, Marker, NavigationControl, setWorkerUrl,
  type GeoJSONSource, type MapLayerMouseEvent,
} from "maplibre-gl";
import { useCallback, useEffect, useRef, useState } from "react";
import { crowdConfig, quickIcon } from "@/features/crowd/config";
import { PlaceSheet } from "@/features/crowd/PlaceSheet";
import { config, type Language } from "@/lib/config";
import { translator } from "@/lib/i18n";
import { messages } from "./messages";

// Worker file is copied into public/ by scripts/copy-map-worker.mjs.
setWorkerUrl("/maplibre-gl-worker.js");

export type MapCity = { id: string; name: string; name_hi: string | null; lat: number; lng: number; default_zoom: number };
/** Kept for the home page's props; places are now loaded per city from /api/crowd. */
export type MapPlace = { id: string; name: string; name_hi: string | null; category: string; lat: number; lng: number; city_id: string };

type CrowdPlace = {
  id: string; name: string; name_hi: string | null; category: string; lat: number; lng: number;
  level: number; source: "live" | "estimated"; reports: number;
};
type Alert = { id: string; kind: string; place_id: string | null; lat: number; lng: number };
type CrowdData = { places: CrowdPlace[]; alerts: Alert[] };

const LEVEL_COLOR = ["match", ["get", "level"],
  ...config.crowd.levels.flatMap((l) => [l.level, l.color]), config.crowd.noDataColor] as unknown as string;

export function MapView({ lang, cities }: { lang: Language; cities: MapCity[]; places?: MapPlace[] }) {
  const t = translator(messages, lang);
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const alertMarkers = useRef<Marker[]>([]);
  const [ready, setReady] = useState(false);
  const [activeCity, setActiveCity] = useState<string | null>(
    cities.some((c) => c.id === config.defaultCity) ? config.defaultCity : cities[0]?.id ?? null,
  );
  const [data, setData] = useState<CrowdData | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [locError, setLocError] = useState("");

  // Create the map once.
  useEffect(() => {
    if (!box.current) return;
    const start = cities.find((c) => c.id === config.defaultCity) ?? cities[0];
    const m = new MLMap({
      container: box.current,
      style: config.map.styleUrl,
      center: start ? [start.lng, start.lat] : config.map.worldCenter,
      zoom: start ? start.default_zoom : config.map.worldZoom,
      attributionControl: { compact: true },
    });
    map.current = m;
    m.addControl(new NavigationControl({ showCompass: false }), "bottom-right");
    m.on("load", () => {
      m.addSource("places", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({
        id: "places",
        type: "circle",
        source: "places",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, ["case", ["==", ["get", "live"], 1], 5, 3], 15, ["case", ["==", ["get", "live"], 1], 11, 8]],
          "circle-color": LEVEL_COLOR,
          "circle-opacity": ["case", ["==", ["get", "live"], 1], 1, 0.55],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": ["case", ["==", ["get", "live"], 1], 2.5, 1],
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
      if (res.ok) setData(await res.json());
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

  // Push data into the map.
  useEffect(() => {
    const m = map.current;
    if (!ready || !m || !data) return;
    (m.getSource("places") as GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: data.places.map((p) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [p.lng, p.lat] },
        properties: { id: p.id, level: p.level, live: p.source === "live" ? 1 : 0 },
      })),
    });
    alertMarkers.current.forEach((mk) => mk.remove());
    alertMarkers.current = data.alerts.map((a) => {
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

  function locate() {
    setLocError("");
    if (!navigator.geolocation) { setLocError(t("locate.unsupported")); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        // Switch to the nearest launch city so its places load.
        const nearest = cities.reduce<MapCity | null>((best, c) => {
          const d = (c.lat - latitude) ** 2 + (c.lng - longitude) ** 2;
          return !best || d < (best.lat - latitude) ** 2 + (best.lng - longitude) ** 2 ? c : best;
        }, null);
        if (nearest) setActiveCity(nearest.id);
        map.current?.flyTo({ center: [longitude, latitude], zoom: 15 });
      },
      () => setLocError(t("locate.denied")),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  const liveCount = data?.places.filter((p) => p.source === "live").length ?? 0;

  return (
    <div className="relative flex-1">
      {/* Inline style: MapLibre's CSS sets position: relative on this element. */}
      <div ref={box} style={{ position: "absolute", inset: 0 }} aria-label={t("mapLabel")} role="region" />

      <div className="absolute inset-x-0 top-0 z-10 flex gap-2 overflow-x-auto p-3 [scrollbar-width:none]">
        {cities.map((c) => (
          <button key={c.id} type="button" onClick={() => flyTo(c)}
                  className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium shadow ${activeCity === c.id ? "bg-blue-600 text-white" : "bg-white text-gray-800 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-100"}`}>
            {lang === "hi" && c.name_hi ? c.name_hi : c.name}
          </button>
        ))}
      </div>

      <div className="absolute bottom-36 right-2.5 z-10 flex flex-col items-end gap-2 sm:bottom-28">
        {locError && <p className="max-w-56 rounded-md bg-white px-2 py-1 text-xs shadow dark:bg-gray-900">{locError}</p>}
        <button type="button" onClick={locate} title={t("locate")}
                className="grid h-10 w-10 place-items-center rounded-full bg-white text-lg shadow hover:bg-gray-50 dark:bg-gray-900">
          <span aria-hidden>◎</span><span className="sr-only">{t("locate")}</span>
        </button>
      </div>

      <Legend lang={lang} places={data?.places.length ?? 0} live={liveCount} />

      {selected && (
        <PlaceSheet key={selected} placeId={selected} lang={lang} onClose={() => setSelected(null)}
                    onChanged={() => activeCity && void loadCity(activeCity)} />
      )}
    </div>
  );
}

function Legend({ lang, places, live }: { lang: Language; places: number; live: number }) {
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
        <p className="mt-1 text-[11px] text-gray-500">{t("legend.counts", { places, live })}</p>
      )}
    </div>
  );
}
