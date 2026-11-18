import Link from "next/link";
import { logout } from "@/app/(auth)/actions";
import { setLanguage } from "@/app/lang-actions";
import type { Language } from "@/lib/config";
import { translator } from "@/lib/i18n";
import { common } from "@/lib/i18n/common";
import type { Viewer } from "@/lib/session";
import { NotificationBell } from "@/features/alerts/NotificationBell";

export function Header({ lang, viewer }: { lang: Language; viewer: Viewer }) {
  const t = translator(common, lang);
  const link = "rounded-md px-2.5 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-800";
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-gray-200 bg-white/90 px-3 backdrop-blur sm:px-5 dark:border-gray-800 dark:bg-gray-950/90">
      <Link href="/" className="mr-auto flex items-center gap-2 font-semibold">
        <span aria-hidden className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-green-500 via-yellow-400 to-red-500 text-xs text-white">●</span>
        CrowdMap
      </Link>

      <form action={setLanguage}>
        <input type="hidden" name="lang" value={lang === "en" ? "hi" : "en"} />
        <button className={link} type="submit">{t("nav.language")}</button>
      </form>

      {viewer ? (
        <>
          <NotificationBell label={t("nav.notifications")} />
          <Link className={`${link} hidden sm:inline`} href="/saved">{t("nav.saved")}</Link>
          {viewer.role === "admin" && <Link className={link} href="/admin">{t("nav.admin")}</Link>}
          <Link className={`${link} hidden sm:inline`} href="/me">{t("nav.me")}</Link>
          <form action={logout}>
            <button className={link} type="submit">{t("nav.logout")}</button>
          </form>
        </>
      ) : (
        <>
          <Link className={link} href="/login">{t("nav.login")}</Link>
          <Link className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700" href="/signup">
            {t("nav.signup")}
          </Link>
        </>
      )}
    </header>
  );
}
