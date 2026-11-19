// Home: just the rotating Earth and the search (plus a language switch in the corner).
import { setLanguage } from "@/app/lang-actions";
import { redirect } from "next/navigation";
import { Earth } from "@/features/site/Earth";
import { GlowSearch } from "@/features/site/GlowSearch";
import { WarmUp } from "@/features/site/WarmUp";
import { messages } from "@/features/site/messages";
import { translator } from "@/lib/i18n";
import { common } from "@/lib/i18n/common";
import { getLang } from "@/lib/i18n/server";
import { getViewer } from "@/lib/session";

export default async function Home({ searchParams }: PageProps<"/">) {
  // Old links from notifications pointed at /?place=<id>; the map now lives at /map.
  const sp = await searchParams;
  if (typeof sp.place === "string") redirect(`/map?place=${encodeURIComponent(sp.place)}`);

  const [lang, viewer] = await Promise.all([getLang(), getViewer()]);
  const welcome = sp.welcome === "1" && viewer ? viewer.displayName : null;
  const t = translator(messages, lang);
  const tc = translator(common, lang);

  return (
    <main className="relative isolate flex min-h-[100svh] flex-1 flex-col items-center overflow-hidden bg-black px-4 pt-[18vh] text-center text-zinc-100">
      {/* Just the globe and the search. */}
      <Earth className="absolute inset-x-0 -bottom-[22vh] -z-10 h-[125vh] sm:-bottom-[52vh] sm:h-[150vh]" />
      {welcome && (
        <p role="status" className="mb-6 rounded-full bg-blue-600/15 px-4 py-1.5 text-sm text-blue-200 ring-1 ring-blue-500/30">
          {lang === "hi" ? `CrowdMap में आपका स्वागत है, ${welcome}।` : `Welcome to CrowdMap, ${welcome}.`}
        </p>
      )}
      <h1 className="text-5xl font-semibold tracking-tight text-white [text-shadow:0_2px_18px_rgba(0,0,0,0.65)] motion-safe:animate-[rise_700ms_ease-out_both] sm:text-7xl">CrowdMap</h1>
      <p className="mt-4 max-w-xl text-lg text-zinc-100 [text-shadow:0_1px_10px_rgba(0,0,0,0.85)] motion-safe:animate-[rise_700ms_120ms_ease-out_both] sm:text-xl">{t("tagline")}</p>
      <div className="relative z-10 mt-10 flex w-full flex-col items-center motion-safe:animate-[rise_700ms_240ms_ease-out_both]">
        <GlowSearch lang={lang} labels={{
          placeholder: t("searchPlaceholder"), search: t("search"), cursor: tc("cursor.search"), ours: t("ours"), world: t("world"),
          none: t("none"), searching: t("searching"),
          level: { 1: t("level.1"), 2: t("level.2"), 3: t("level.3"), 4: t("level.4"), 5: t("level.5") },
        }} />
      </div>
      <WarmUp />
      <form action={setLanguage} className="absolute bottom-4 right-4">
        <input type="hidden" name="lang" value={lang === "en" ? "hi" : "en"} />
        <button type="submit" className="rounded-full bg-black/50 px-3 py-1 text-xs text-zinc-300 ring-1 ring-white/15 backdrop-blur hover:text-white">
          {lang === "en" ? "हिन्दी" : "English"}
        </button>
      </form>
    </main>
  );
}
