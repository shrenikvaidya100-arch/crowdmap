// Home: hero with the rotating Earth, the glow search, a way into the map, footer.
import Link from "next/link";
import { redirect } from "next/navigation";
import { Earth } from "@/features/site/Earth";
import { GlowSearch } from "@/features/site/GlowSearch";
import { messages } from "@/features/site/messages";
import { Reveal } from "@/features/site/Reveal";
import { SiteFooter } from "@/features/site/SiteFooter";
import { config } from "@/lib/config";
import { isSupabaseConfigured } from "@/lib/env";
import { translator } from "@/lib/i18n";
import { common } from "@/lib/i18n/common";
import { getLang } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

async function loadCities() {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const [{ data: cities }, { data: counts }] = await Promise.all([
    supabase.from("cities").select("id, name, name_hi, lat, lng, default_zoom").order("sort_order"),
    supabase.rpc("city_place_counts"),
  ]);
  const n = new Map(((counts ?? []) as { city_id: string; n: number }[]).map((c) => [c.city_id, c.n]));
  return (cities ?? []).map((c) => ({ ...c, places: n.get(c.id) ?? 0 }));
}

export default async function Home({ searchParams }: PageProps<"/">) {
  // Old links from notifications pointed at /?place=<id>; the map now lives at /map.
  const sp = await searchParams;
  if (typeof sp.place === "string") redirect(`/map?place=${encodeURIComponent(sp.place)}`);

  const [lang, cities] = await Promise.all([getLang(), loadCities()]);
  const t = translator(messages, lang);
  const tc = translator(common, lang);
  const links = [
    { label: tc("nav.home"), href: "/" }, { label: tc("nav.map"), href: "/map" }, { label: tc("nav.about"), href: "/about" },
    { label: tc("nav.whatsNew"), href: "/whats-new" }, { label: tc("nav.gettingStarted"), href: "/getting-started" },
    { label: tc("nav.contact"), href: "/contact" },
  ];

  return (
    <main className="flex-1 bg-black text-zinc-100">
      {/* Hero */}
      <section className="relative isolate flex min-h-[calc(100svh-3.5rem)] flex-col items-center overflow-hidden px-4 pt-[12vh] text-center">
        <Earth className="absolute inset-x-0 -bottom-[38vh] -z-10 h-[105vh] sm:-bottom-[45vh] sm:h-[120vh]" />
        {/* Soft edge where the hero ends, so the globe fades into the page. */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-b from-transparent to-black" />
        <h1 className="text-5xl font-semibold tracking-tight text-white sm:text-7xl">CrowdMap</h1>
        <p className="mt-4 max-w-xl text-lg text-zinc-300 sm:text-xl">{t("tagline")}</p>
        <p className="mt-3 max-w-lg text-sm text-zinc-400 sm:text-base">{t("heroBody")}</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/map" className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-500">
            {t("openMap")}
          </Link>
          <Link href="/getting-started" className="rounded-lg border border-zinc-600 px-5 py-2.5 text-sm font-medium text-zinc-100 hover:border-zinc-400 hover:bg-zinc-900/60">
            {t("getStarted")}
          </Link>
        </div>
      </section>

      {/* Search */}
      <section className="flex min-h-[70vh] flex-col items-center justify-center px-4 py-24">
        <Reveal className="flex w-full flex-col items-center">
          <h2 className="mb-8 text-center text-3xl font-semibold tracking-tight text-white sm:text-4xl">{t("searchTitle")}</h2>
          <GlowSearch lang={lang} labels={{
            placeholder: t("searchPlaceholder"), search: t("search"), ours: t("ours"), world: t("world"),
            none: t("none"), searching: t("searching"),
            level: { 1: t("level.1"), 2: t("level.2"), 3: t("level.3"), 4: t("level.4"), 5: t("level.5") },
          }} />
        </Reveal>
      </section>

      {/* Into the map */}
      <section className="border-t border-zinc-900 px-4 py-20">
        <Reveal className="mx-auto max-w-5xl">
          <h2 className="text-3xl font-semibold tracking-tight text-white">{t("exploreTitle")}</h2>
          <p className="mt-2 max-w-xl text-zinc-400">{t("exploreBody")}</p>
          <ul className="mt-8 grid gap-3 sm:grid-cols-3">
            {cities.map((c) => (
              <li key={c.id}>
                <Link href={`/map?lat=${c.lat}&lng=${c.lng}&z=${c.default_zoom}`}
                      className="group flex items-baseline justify-between rounded-xl border border-zinc-800 px-5 py-4 hover:border-blue-500/60 hover:bg-zinc-950">
                  <span className="text-lg font-medium text-zinc-100">{lang === "hi" && c.name_hi ? c.name_hi : c.name}</span>
                  <span className="text-sm text-zinc-500 group-hover:text-zinc-300">{t("liveNow", { n: c.places.toLocaleString("en-IN") })}</span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-6 flex gap-2 text-xs text-zinc-500">
            {[1, 2, 3, 4, 5].map((l) => (
              <span key={l} className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: config.crowd.levels[l - 1].color }} />
                {t(`level.${l}`)}
              </span>
            ))}
          </div>
        </Reveal>
      </section>

      <SiteFooter links={links} note={t("footerNote")} />
    </main>
  );
}
