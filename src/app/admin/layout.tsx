// Admin area. Only active admins get in, and only after the admin check (typing
// a code). Everyone else sees "not found", so the area isn't advertised. The
// database checks the role again on every call.
import { AdminSidebar } from "@/features/admin/AdminSidebar";
import { lockAdmin } from "@/features/admin/gateActions";
import { requireAdminPage } from "@/features/admin/guard";
import { messages } from "@/features/admin/messages";
import { translator } from "@/lib/i18n";
import { getLang } from "@/lib/i18n/server";

export const metadata = { title: "Admin · CrowdMap", robots: { index: false } };

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const [lang, viewer] = await Promise.all([getLang(), requireAdminPage()]);
  const t = translator(messages, lang);
  const today = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date());
  return (
    <div className="flex flex-1 flex-col bg-[#faf8f3] text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <AdminSidebar lang={lang}>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
          <header className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b-2 border-zinc-900 pb-3 dark:border-zinc-100">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-zinc-500">CrowdMap / {t("title")} · {today}</p>
              <h1 className="mt-1 font-serif text-3xl font-semibold tracking-tight">{t("title")}</h1>
              <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">{t("subtitle")}</p>
            </div>
            <form action={lockAdmin} className="flex items-center gap-3 text-sm">
              <span className="text-zinc-600 dark:text-zinc-400">{t("console.signedIn", { name: viewer.displayName })}</span>
              <button title={t("console.lockHint")}
                      className="border border-zinc-900 px-3 py-1.5 font-medium hover:bg-zinc-900 hover:text-white dark:border-zinc-100 dark:hover:bg-zinc-100 dark:hover:text-zinc-900">
                {t("console.lock")}
              </button>
            </form>
          </header>
          <div className="space-y-6">{children}</div>
        </main>
      </AdminSidebar>
    </div>
  );
}
