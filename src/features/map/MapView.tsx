"use client";
// Live map of the world (OpenStreetMap via OpenFreeMap) with CrowdMap places on top.
// User 1 feature. Crowd colours arrive in a later milestone; for now places are grey.
import "maplibre-gl/dist/maplibre-gl.css";
import { Map as MLMap, NavigationControl, Popup, setWorkerUrl, type GeoJSONSource, type MapLayerMouseEvent } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { config, type Language } from "@/lib/config";
import { translator } from "@/lib/i18n";
import { messages } from "./messages";

// Worker file is copied into public/ by scripts/copy-map-worker.mjs.
setWorkerUrl("/maplibre-gl-worker.js");

export type MapCity = { id: string; name: string; name_hi: string | null; lat: number; lng: number; default_zoom: number };
export type MapPlace = { id: string; name: string; name_hi: string | null; category: string; lat: number; lng: number; city_id: string };

export function MapView({ lang, cities, places }: { lang: Language; cities: MapCity[]; places: MapPlace[] }) {
  const t = translator(messages, lang);
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const [activeCity, setActiveCity] = useState<string | null>(
    cities.some((c) => c.id === config.defaultCity) ? config.defaultCity : null,
  );
  const [locError, setLocError] = useState("");

  useEffect(() => {
    if (!box.current) return;
    const start = cities.find((c) => c.id === config.defaultCity);
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
      m.addSource("places", { type: "geojson", data: toGeoJSON(places, lang) });
      m.addLayer({
        id: "places",
        type: "circle",
        source: "places",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 3, 15, 8],
          "circle-color": config.crowd.noDataColor,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.5,
        },
      });
      m.on("click", "places", (e: MapLayerMouseEvent) => {
        const f = e.features?.[0];
        if (!f || f.geometry.type !== "Point") return;
        new Popup({ offset: 10 })
          .setLngLat(f.geometry.coordinates as [number, number])
          .setText(`${f.properties.name} · ${t("noData")}`)
          .addTo(m);
      });
      m.on("mouseenter", "places", () => { m.getCanvas().style.cursor = "pointer"; });
      m.on("mouseleave", "places", () => { m.getCanvas().style.cursor = ""; });
    });
    return () => { m.remove(); map.current = null; };
    // The map is created once; data updates are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const src = map.current?.getSource("places") as GeoJSONSource | undefined;
    src?.setData(toGeoJSON(places, lang));
  }, [places, lang]);

  function flyTo(c: MapCity) {
    setActiveCity(c.id);
    map.current?.flyTo({ center: [c.lng, c.lat], zoom: c.default_zoom, essential: true });
  }

  function locate() {
    setLocError("");
    if (!navigator.geolocation) { setLocError(t("locate.unsupported")); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setActiveCity(null);
        map.current?.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 15 });
      },
      () => setLocError(t("locate.denied")),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

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

      <div className="absolute bottom-24 right-2.5 z-10 flex flex-col items-end gap-2">
        {locError && <p className="max-w-56 rounded-md bg-white px-2 py-1 text-xs shadow dark:bg-gray-900">{locError}</p>}
        <button type="button" onClick={locate} title={t("locate")}
                className="grid h-10 w-10 place-items-center rounded-full bg-white text-lg shadow hover:bg-gray-50 dark:bg-gray-900">
          <span aria-hidden>◎</span><span className="sr-only">{t("locate")}</span>
        </button>
      </div>

      <Legend lang={lang} />
    </div>
  );
}

function Legend({ lang }: { lang: Language }) {
  const t = translator(messages, lang);
  return (
    <div className="absolute bottom-3 left-3 z-10 flex flex-wrap gap-x-3 gap-y-1 rounded-lg bg-white/95 px-3 py-2 text-xs shadow dark:bg-gray-900/95">
      {config.crowd.levels.map((l) => (
        <span key={l.level} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: l.color }} />{t(`level.${l.key}`)}
        </span>
      ))}
    </div>
  );
}

function toGeoJSON(places: MapPlace[], lang: Language): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: places.map((p) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.lng, p.lat] },
      properties: { id: p.id, name: lang === "hi" && p.name_hi ? p.name_hi : p.name, category: p.category },
    })),
  };
}
