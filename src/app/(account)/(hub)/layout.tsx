// Profile, Settings and Saved places share one frame: shortcuts on the left
// (a row of chips on phones), the page on the right.
import { AccountNav, type AccountLink } from "@/features/profile/AccountNav";
import { translator } from "@/lib/i18n";
import { common } from "@/lib/i18n/common";
import { getLang } from "@/lib/i18n/server";
import { getViewer } from "@/lib/session";

export default async function AccountHubLayout({ children }: { children: React.ReactNode }) {
  const [lang, viewer] = await Promise.all([getLang(), getViewer()]);
  const t = translator(common, lang);
  const links: AccountLink[] = [
    { href: "/me", label: t("menu.profile"), icon: "user" },
    { href: "/settings", label: t("menu.settings"), icon: "settings" },
    { href: "/saved", label: t("menu.saved"), icon: "bookmark" },
    { href: "/saved#reminders", label: t("menu.reminders"), icon: "bell" },
    { href: "/community", label: t("nav.community"), icon: "users" },
    { href: "/map", label: t("nav.map"), icon: "map" },
    ...(viewer?.role === "admin" ? [{ href: "/admin", label: t("nav.admin"), icon: "shield" as const }] : []),
  ];
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 pt-4 lg:flex-row lg:gap-8">
      <aside className="lg:w-56 lg:shrink-0 lg:pt-4">
        <AccountNav links={links} label={t("menu.profile")} />
      </aside>
      <div className="flex min-w-0 flex-1 [&>main]:mx-0 [&>main]:max-w-none [&>main]:px-0">{children}</div>
    </div>
  );
}
