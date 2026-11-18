// Shared frame for About, What's New, Getting Started and Contact: an animated
// hero (drifting glow, pulsing crowd dots, the title rising word by word) and
// content cards that rise in as you scroll and light up under the pointer.
import Link from "next/link";
import type { ReactNode } from "react";
import { HeroBackdrop, Spotlight } from "@/features/site/InfoFx";
import { Reveal } from "@/features/site/Reveal";
import { SiteFooter } from "@/features/site/SiteFooter";
import { translator } from "@/lib/i18n";
import { common } from "@/lib/i18n/common";
import { getLang } from "@/lib/i18n/server";

/** Text styles for everything inside a card. */
export const PROSE = "text-[15px] leading-relaxed text-zinc-300 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-white [&_li]:ml-5 [&_li]:list-disc [&_li]:marker:text-[#0894FF] [&_ul]:mt-3 [&_ul]:space-y-2 [&_p]:mt-3";

/** One content card; `i` staggers its entrance after the cards before it. */
export function InfoCard({ i = 0, label, children, className = "" }: { i?: number; label?: string; children: ReactNode; className?: string }) {
  return (
    <Reveal delay={Math.min(i, 6) * 90}>
      <Spotlight className={`p-6 sm:p-8 ${className}`}>
        {label && <p className="mb-4 font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-[#0894FF]">{label}</p>}
        <div className={PROSE}>{children}</div>
      </Spotlight>
    </Reveal>
  );
}

export async function InfoPage({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  const tc = translator(common, await getLang());
  const links = [
    { label: tc("nav.home"), href: "/" }, { label: tc("nav.map"), href: "/map" }, { label: tc("nav.about"), href: "/about" },
    { label: tc("nav.whatsNew"), href: "/whats-new" }, { label: tc("nav.gettingStarted"), href: "/getting-started" },
    { label: tc("nav.contact"), href: "/contact" },
  ];
  const words = title.split(" ");
  return (
    <main className="flex flex-1 flex-col bg-black text-zinc-300">
      <header className="relative isolate overflow-hidden px-4 pb-20 pt-28 sm:pb-28 sm:pt-40">
        <HeroBackdrop />
        <div className="mx-auto max-w-4xl">
          <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-zinc-400 backdrop-blur motion-safe:animate-[rise_600ms_ease-out_both]">
            <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" /></span>
            CrowdMap · live across India
          </p>
          <h1 className="text-balance text-5xl font-semibold tracking-tight text-white sm:text-7xl">
            {words.map((w, i) => (
              <span key={i} className="inline-block motion-safe:animate-[rise_800ms_ease-out_both]" style={{ animationDelay: `${120 + i * 110}ms` }}>
                {w}{i < words.length - 1 ? " " : ""}
              </span>
            ))}
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-zinc-400 motion-safe:animate-[rise_800ms_ease-out_both] sm:text-xl" style={{ animationDelay: `${200 + words.length * 110}ms` }}>
            {intro}
          </p>
        </div>
      </header>
      <div className="mx-auto w-full max-w-4xl flex-1 space-y-5 px-4 pb-20">
        {children}
        <Reveal>
          <div className="relative mt-10 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#0894FF]/20 via-zinc-950 to-emerald-500/10 p-8 sm:flex sm:items-center sm:justify-between sm:p-10">
            <div>
              <p className="text-2xl font-semibold text-white">See it live</p>
              <p className="mt-1 text-zinc-400">Every dot is a place, coloured by how busy it is right now.</p>
            </div>
            <Link href="/map" className="cursor-target group mt-6 inline-flex items-center gap-2 rounded-full bg-[#0894FF] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#2aa3ff] sm:mt-0">
              Open the map <span aria-hidden className="transition-transform group-hover:translate-x-1">→</span>
            </Link>
          </div>
        </Reveal>
      </div>
      <SiteFooter links={links} note="Crowd levels from people on the spot. Map data from OpenStreetMap." />
    </main>
  );
}
