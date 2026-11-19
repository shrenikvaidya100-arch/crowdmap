// /admin-check: type the code before the admin area opens.
import { notFound } from "next/navigation";
import { AdminGateForm } from "@/features/admin/AdminGateForm";
import { isUnlocked } from "@/features/admin/gate";
import { messages } from "@/features/admin/messages";
import { translator } from "@/lib/i18n";
import { getLang } from "@/lib/i18n/server";
import { getViewer } from "@/lib/session";
import { redirect } from "next/navigation";

export const metadata = { title: "Admin check · CrowdMap", robots: { index: false } };

export default async function AdminCheckPage() {
  const [viewer, lang] = await Promise.all([getViewer(), getLang()]);
  if (viewer?.role !== "admin") notFound();
  if (await isUnlocked(viewer.id)) redirect("/admin");
  const t = translator(messages, lang);
  return (
    <main className="grid flex-1 place-items-center bg-[#f5f1e8] px-4 py-16 text-zinc-900">
      <AdminGateForm labels={{
        title: t("gate.title"), body: t("gate.body", { name: viewer.displayName }), field: t("gate.field"),
        enter: t("gate.enter"), refresh: t("gate.refresh"), wrong: t("gate.wrong"), expired: t("gate.expired"),
        empty: t("gate.empty"), note: t("gate.note"), image: t("gate.image"),
      }} />
    </main>
  );
}
