// Site header: floating bubbles over the page. Left: the logo. Right: day/night,
// notifications and the account (or Sign In). The main navigation shows only
// on the home page; the map runs underneath the bubbles.
import Link from "next/link";
import { Icon } from "@/components/icons/Icon";
import { NotificationBell } from "@/features/alerts/NotificationBell";
import { AccountMenu } from "@/features/site/AccountMenu";
import { HeaderSpacer, HomeNav } from "@/features/site/HeaderParts";
import { ThemeToggle } from "@/features/site/ThemeToggle";
import type { Language } from "@/lib/config";
import { translator } from "@/lib/i18n";
import { common } from "@/lib/i18n/common";
import type { Viewer } from "@/lib/session";

const bubble = "pointer-events-auto flex items-center rounded-full bg-black/70 shadow-lg ring-1 ring-white/10 backdrop-blur-md";

export function Header({ lang, viewer }: { lang: Language; viewer: Viewer }) {
  const t = translator(common, lang);
  const items = [
    { label: t("nav.home"), href: "/" },
    { label: t("nav.map"), href: "/map" },
    { label: t("nav.community"), href: "/community" },
    { label: t("nav.about"), href: "/about" },
    { label: t("nav.whatsNew"), href: "/whats-new" },
    { label: t("nav.gettingStarted"), href: "/getting-started" },
    { label: t("nav.contact"), href: "/contact" },
  ];
  return (
    <>
      <header className="pointer-events-none fixed inset-x-0 top-0 z-40 flex h-16 items-center gap-2 px-3 text-zinc-100 sm:px-4 print:hidden">
        <Link href="/" aria-label="CrowdMap" className={`${bubble} gap-2 py-1.5 pl-1.5 pr-3.5 font-semibold tracking-tight text-zinc-50`}>
          <span aria-hidden className="grid h-7 w-7 place-items-center rounded-full bg-blue-600 text-white"><Icon name="logo" size={17} /></span>
          <span className="hidden sm:inline">CrowdMap</span>
        </Link>
        <div className="mx-auto"><HomeNav items={items} menuLabel={t("nav.menu")} /></div>
        <div className="flex items-center gap-2">
          <div className={`${bubble} p-1.5`}>
            <ThemeToggle labels={{ toNight: t("theme.toNight"), toDay: t("theme.toDay"), nightOn: t("theme.nightOn"), dayOn: t("theme.dayOn") }} />
          </div>
          {viewer ? (
            <>
              <div className={`${bubble} p-0.5`}><NotificationBell label={t("nav.notifications")} /></div>
              <div className="pointer-events-auto rounded-full transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:scale-105 hover:shadow-[0_0_0_3px_rgba(59,130,246,0.55),0_8px_24px_rgba(37,99,235,0.35)] motion-reduce:hover:transform-none"><AccountMenu viewer={viewer} labels={{
                profile: t("menu.profile"), settings: t("menu.settings"), saved: t("menu.saved"),
                reminders: t("menu.reminders"), admin: t("nav.admin"), setupAvatar: t("menu.setupAvatar"),
                signOutTitle: t("menu.signOutTitle"), signOutBody: t("menu.signOutBody"), signOut: t("menu.signOut"), cancel: t("menu.cancel"),
              }} /></div>
            </>
          ) : (
            <Link href="/login" className={`${bubble} whitespace-nowrap px-4 py-2 text-sm font-medium text-zinc-50 hover:bg-zinc-900`}>
              {t("nav.signIn")}
            </Link>
          )}
        </div>
      </header>
      <HeaderSpacer />
    </>
  );
}
