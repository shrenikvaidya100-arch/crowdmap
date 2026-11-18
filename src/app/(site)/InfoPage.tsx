// Shared frame for About, What's New, Getting Started and Contact.
import Link from "next/link";
import type { ReactNode } from "react";
import { DotGrid, Eyebrow, Frame } from "@/features/site/Frame";
import { SiteFooter } from "@/features/site/SiteFooter";
import { translator } from "@/lib/i18n";
import { common } from "@/lib/i18n/common";
import { getLang } from "@/lib/i18n/server";

export async function InfoPage({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  const tc = translator(common, await getLang());
  const links = [
    { label: tc("nav.home"), href: "/" }, { label: tc("nav.map"), href: "/map" }, { label: tc("nav.about"), href: "/about" },
    { label: tc("nav.whatsNew"), href: "/whats-new" }, { label: tc("nav.gettingStarted"), href: "/getting-started" },
    { label: tc("nav.contact"), href: "/contact" },
  ];
  return (
    <main className="flex flex-1 flex-col bg-black text-zinc-300">
      <header className="relative overflow-hidden border-b border-zinc-900 px-4 pb-16 pt-10 sm:pt-16">
        <DotGrid />
        <div className="relative mx-auto max-w-3xl">
          <Eyebrow>CrowdMap</Eyebrow>
          <h1 className="text-balance text-4xl font-semibold tracking-tight text-white sm:text-6xl">{title}</h1>
          <p className="mt-5 max-w-2xl text-lg text-zinc-400">{intro}</p>
        </div>
      </header>
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-16">
        <Frame className="p-6 sm:p-10">
          <div className="space-y-10 text-[15px] leading-relaxed [&_h2]:font-mono [&_h2]:text-xs [&_h2]:font-semibold [&_h2]:uppercase [&_h2]:tracking-[0.2em] [&_h2]:text-[#0894FF] [&_li]:ml-5 [&_li]:list-disc [&_ul]:mt-3 [&_ul]:space-y-1.5 [&_p]:mt-3">
            {children}
          </div>
        </Frame>
        <Link href="/map" className="mt-10 inline-block rounded-full bg-[#0894FF] px-6 py-3 text-sm font-semibold text-white hover:bg-[#2aa3ff]">
          Open the map
        </Link>
      </div>
      <SiteFooter links={links} note="Crowd levels from people on the spot. Map data from OpenStreetMap." />
    </main>
  );
}
