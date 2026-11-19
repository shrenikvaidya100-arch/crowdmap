// /community: explore the city you're in (or pick one): the closest quiet place,
// how busy the city is right now, and the community's photos and posts.
import Link from "next/link";
import { CommunityExplorer, type CommunityCity } from "@/features/community/CommunityExplorer";
import { HeroBackdrop } from "@/features/site/InfoFx";
import { SiteFooter } from "@/features/site/SiteFooter";
import { isSupabaseConfigured } from "@/lib/env";
import { translator } from "@/lib/i18n";
import { common } from "@/lib/i18n/common";
import { getLang } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Community · CrowdMap" };

async function loadCities(): Promise<CommunityCity[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.from("cities").select("id, name, name_hi, state, lat, lng").order("sort_order");
  if (error) console.error("cities", error.message);
  return data ?? [];
}

export default async function CommunityPage({ searchParams }: PageProps<"/community">) {
  const [sp, lang, cities] = await Promise.all([searchParams, getLang(), loadCities()]);
  const tc = translator(common, lang);
  const asked = typeof sp.city === "string" ? sp.city : null;
  const initialCity = asked && cities.some((c) => c.id === asked) ? asked : null;
  const links = [
    { label: tc("nav.home"), href: "/" }, { label: tc("nav.map"), href: "/map" }, { label: tc("nav.community"), href: "/community" },
    { label: tc("nav.about"), href: "/about" }, { label: tc("nav.whatsNew"), href: "/whats-new" },
    { label: tc("nav.gettingStarted"), href: "/getting-started" }, { label: tc("nav.contact"), href: "/contact" },
  ];
  return (
    <main className="flex flex-1 flex-col bg-black text-zinc-300">
      <section className="relative isolate overflow-x-clip px-4 pb-20 pt-28 sm:pt-36">
        {/* The glow and pulsing dots stay behind the title, not the whole page. */}
        <div aria-hidden className="absolute inset-x-0 top-0 -z-10 h-[44rem]"><HeroBackdrop /></div>
        <CommunityExplorer cities={cities} lang={lang} initialCity={initialCity} />
        <div className="mx-auto mt-10 max-w-5xl text-center">
          <Link href="/map" className="group inline-flex items-center gap-2 rounded-full border border-white/15 px-5 py-2.5 text-sm font-medium text-zinc-100 transition hover:bg-white/5">
            {tc("nav.map")} <span aria-hidden className="transition-transform group-hover:translate-x-1">→</span>
          </Link>
        </div>
      </section>
      <SiteFooter links={links} note="Crowd levels from people on the spot. Map data from OpenStreetMap." />
    </main>
  );
}
