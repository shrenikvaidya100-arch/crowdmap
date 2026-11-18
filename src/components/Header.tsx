// Site header on every page: logo, main navigation, language, and either
// Sign In or the signed-in links (notifications, saved, account).
import Link from "next/link";
import { setLanguage } from "@/app/lang-actions";
import { Icon } from "@/components/icons/Icon";
import { NotificationBell } from "@/features/alerts/NotificationBell";
import { AccountMenu } from "@/features/site/AccountMenu";
import { NavTabs } from "@/features/site/NavTabs";
import { ThemeToggle } from "@/features/site/ThemeToggle";
import type { Language } from "@/lib/config";
import { translator } from "@/lib/i18n";
import { common } from "@/lib/i18n/common";
import type { Viewer } from "@/lib/session";

export function Header({ lang, viewer }: { lang: Language; viewer: Viewer }) {
  const t = translator(common, lang);
  const link = "rounded-md px-2.5 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50";
  const items = [
    { label: t("nav.home"), href: "/" },
    { label: t("nav.map"), href: "/map" },
    { label: t("nav.about"), href: "/about" },
    { label: t("nav.whatsNew"), href: "/whats-new" },
    { label: t("nav.gettingStarted"), href: "/getting-started" },
    { label: t("nav.contact"), href: "/contact" },
  ];
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-zinc-800/80 bg-black/80 px-3 text-zinc-100 backdrop-blur sm:px-5">
      <Link href="/" className="mr-2 flex items-center gap-2 font-semibold tracking-tight text-zinc-50">
        <span aria-hidden className="grid h-7 w-7 place-items-center rounded-lg bg-blue-600 text-white"><Icon name="logo" size={18} /></span>
        CrowdMap
      </Link>
      <NavTabs items={items} menuLabel={t("nav.menu")} />
      <div className="ml-auto flex items-center gap-1">
        <form action={setLanguage}>
          <input type="hidden" name="lang" value={lang === "en" ? "hi" : "en"} />
          <button className={link} type="submit">{t("nav.language")}</button>
        </form>
        <ThemeToggle labels={{ toNight: t("theme.toNight"), toDay: t("theme.toDay"), nightOn: t("theme.nightOn"), dayOn: t("theme.dayOn") }} />
        {viewer ? (
          <>
            <NotificationBell label={t("nav.notifications")} />
            <AccountMenu viewer={viewer} labels={{
              profile: t("menu.profile"), settings: t("menu.settings"), saved: t("menu.saved"),
              reminders: t("menu.reminders"), admin: t("nav.admin"), setupAvatar: t("menu.setupAvatar"),
            }} />
          </>
        ) : (
          <Link href="/login" className="rounded-md border border-zinc-600 px-3 py-1.5 text-sm font-medium text-zinc-50 hover:border-zinc-400 hover:bg-zinc-900">
            {t("nav.signIn")}
          </Link>
        )}
      </div>
    </header>
  );
}
