// Admin area. Only active admins get in; everyone else sees "not found", so
// the area's existence isn't advertised. The database checks again on every call.
import { AdminNav } from "@/features/admin/AdminNav";
import { messages } from "@/features/admin/messages";
import { translator } from "@/lib/i18n";
import { getLang } from "@/lib/i18n/server";
import { requireAdminPage } from "@/features/admin/guard";

export const metadata = { title: "Admin · CrowdMap", robots: { index: false } };

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const [lang] = await Promise.all([getLang(), requireAdminPage()]);
  const t = translator(messages, lang);
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold">🛡️ {t("title")}</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{t("subtitle")}</p>
      </header>
      <AdminNav lang={lang} />
      <div className="mt-5 space-y-5">{children}</div>
    </main>
  );
}
