import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { Header } from "@/components/Header";
import { SiteCursor } from "@/features/site/SiteCursor";
import { getLang } from "@/lib/i18n/server";
import { getViewer } from "@/lib/session";
import { THEME_SCRIPT } from "@/lib/theme-script";
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


export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [lang, viewer] = await Promise.all([getLang(), getViewer()]);
  return (
    <html lang={lang} className={`${sans.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* Sets light or dark before the first paint. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <Header lang={lang} viewer={viewer} />
        {children}
        <SiteCursor />
      </body>
    </html>
  );
}
