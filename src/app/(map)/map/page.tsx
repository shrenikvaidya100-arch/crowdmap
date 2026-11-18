// /map: the full-screen live map.
import { MapView, type LinkedPlace, type MapCity } from "@/features/map/MapView";
import { isSupabaseConfigured } from "@/lib/env";
import { translator } from "@/lib/i18n";
import { common } from "@/lib/i18n/common";
import { getLang } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

// Places and crowd levels are loaded per city by the map itself (/api/crowd).
async function loadCities(): Promise<MapCity[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.from("cities")
    .select("id, name, name_hi, lat, lng, default_zoom").order("sort_order");
  if (error) console.error("cities", error.message);
  return data ?? [];
}

/** /map?place=<id> opens that place (links from notifications and the Saved page). */
async function loadLinkedPlace(id: string | undefined): Promise<LinkedPlace | null> {
  if (!id || !/^[0-9a-f-]{36}$/i.test(id) || !isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("places").select("id, lat, lng, city_id").eq("id", id).neq("status", "removed").maybeSingle();
  return data;
}

/** /map?lat=..&lng=..&z=.. centres the map (from the home page search). */
function parseFocus(sp: Record<string, string | string[] | undefined>) {
  const num = (k: string) => (typeof sp[k] === "string" ? Number(sp[k]) : NaN);
  const lat = num("lat"), lng = num("lng"), z = num("z");
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng, zoom: Number.isFinite(z) ? Math.min(Math.max(z, 2), 18) : 14 };
}

export const metadata = { title: "Map · CrowdMap" };

export default async function MapPage({ searchParams }: PageProps<"/map">) {
  const sp = await searchParams;
  const focus = parseFocus(sp);
  const [lang, cities, linked] = await Promise.all([
    getLang(), loadCities(), loadLinkedPlace(typeof sp.place === "string" ? sp.place : undefined),
  ]);
  const t = translator(common, lang);
  return (
    <main className="relative flex flex-1 flex-col">
      {!isSupabaseConfigured() && (
        <div className="absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-md bg-amber-100 px-3 py-2 text-sm text-amber-900 shadow">
          <strong>{t("setup.title")}:</strong> {t("setup.body")}
        </div>
      )}
      <MapView key={linked?.id ?? (focus ? `${focus.lat},${focus.lng}` : "map")} lang={lang} cities={cities}
               initialPlace={linked} initialFocus={focus} />
    </main>
  );
}
