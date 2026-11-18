// Shared frame for About, What's New, Getting Started and Contact.
import Link from "next/link";
import type { ReactNode } from "react";
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
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-16 sm:py-24">
        <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">{title}</h1>
        <p className="mt-4 text-lg text-zinc-400">{intro}</p>
        <div className="mt-12 space-y-10 text-[15px] leading-relaxed [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-white [&_li]:ml-5 [&_li]:list-disc [&_ul]:mt-3 [&_ul]:space-y-1.5 [&_p]:mt-3">
          {children}
        </div>
        <Link href="/map" className="mt-14 inline-block rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-500">
          Open the map
        </Link>
      </div>
      <SiteFooter links={links} note="Crowd levels from people on the spot. Map data from OpenStreetMap." />
    </main>
  );
}
