import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { Header } from "@/components/Header";
import { SiteCursor } from "@/features/site/SiteCursor";
import { translator } from "@/lib/i18n";
import { common } from "@/lib/i18n/common";
import { getLang } from "@/lib/i18n/server";
import { getViewer } from "@/lib/session";
import "./globals.css";

const sans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "CrowdMap",
  description: "Live crowd levels for temples, markets, restaurants and more. See when a place is quiet before you go.",
  applicationName: "CrowdMap",
  // iPhone "Add to Home Screen" opens full screen with this title.
  appleWebApp: { capable: true, title: "CrowdMap", statusBarStyle: "default" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#2563eb" };

function cursorWords(lang: "en" | "hi") {
  const t = translator(common, lang);
  return { open: t("cursor.open"), explore: t("cursor.explore") };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [lang, viewer] = await Promise.all([getLang(), getViewer()]);
  return (
    <html lang={lang} className={`${sans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <Header lang={lang} viewer={viewer} />
        {children}
        <SiteCursor words={cursorWords(lang)} />
      </body>
    </html>
  );
}
