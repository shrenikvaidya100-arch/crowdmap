// Home: the live map. The map itself is User 1's feature (src/features/map).
import { MapView, type MapCity, type MapPlace } from "@/features/map/MapView";
import { isSupabaseConfigured } from "@/lib/env";
import { translator } from "@/lib/i18n";
import { common } from "@/lib/i18n/common";
import { getLang } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

async function loadMapData(): Promise<{ cities: MapCity[]; places: MapPlace[] }> {
  if (!isSupabaseConfigured()) return { cities: [], places: [] };
  const supabase = await createClient();
  const [cities, places] = await Promise.all([
    supabase.from("cities").select("id, name, name_hi, lat, lng, default_zoom").order("sort_order"),
    supabase.from("places").select("id, name, name_hi, category, lat, lng, city_id")
      .neq("status", "removed").limit(5000),
  ]);
  if (cities.error) console.error("cities", cities.error.message);
  if (places.error) console.error("places", places.error.message);
  return { cities: cities.data ?? [], places: places.data ?? [] };
}

export default async function Home() {
  const [lang, data] = await Promise.all([getLang(), loadMapData()]);
  const t = translator(common, lang);
  return (
    <main className="relative flex flex-1 flex-col">
      {!isSupabaseConfigured() && (
        <div className="absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-md bg-amber-100 px-3 py-2 text-sm text-amber-900 shadow">
          <strong>{t("setup.title")}:</strong> {t("setup.body")}
        </div>
      )}
      <MapView lang={lang} cities={data.cities} places={data.places} />
    </main>
  );
}
