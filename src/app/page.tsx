// Home: the live map. The map itself is User 1's feature (src/features/map).
import { MapView, type MapCity } from "@/features/map/MapView";
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

export default async function Home() {
  const [lang, cities] = await Promise.all([getLang(), loadCities()]);
  const t = translator(common, lang);
  return (
    <main className="relative flex flex-1 flex-col">
      {!isSupabaseConfigured() && (
        <div className="absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-md bg-amber-100 px-3 py-2 text-sm text-amber-900 shadow">
          <strong>{t("setup.title")}:</strong> {t("setup.body")}
        </div>
      )}
      <MapView lang={lang} cities={cities} />
    </main>
  );
}
