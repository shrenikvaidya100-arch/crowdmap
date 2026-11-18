// Admin overview: numbers at a glance, recent admin/system actions, and the
// accounts with the most GPS rejections (a strong bot signal).
import Link from "next/link";
import { formatWhen } from "@/features/admin/format";
import { requireAdminPage } from "@/features/admin/guard";
import { messages } from "@/features/admin/messages";
import { Badge } from "@/features/admin/ui";
import { translator } from "@/lib/i18n";
import { getLang } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

const STATS = [
  "users", "users_new_24h", "users_removed", "admins", "reports_24h", "alerts_active", "media_visible",
  "media_removed", "comments_visible", "comments_removed", "places_unconfirmed", "rejections_24h", "audit_entries",
] as const;

type LogRow = { id: number; at: string; actor_name: string | null; actor_role: string; action: string; target_type: string | null; details: { reason?: string } };
type UserRow = { id: string; display_name: string; status: string; rejections: number; created_at: string };

export default async function AdminOverview() {
  await requireAdminPage();
  const lang = await getLang();
  const t = translator(messages, lang);
  const supabase = await createClient();
  const [stats, adminLog, systemLog, suspicious] = await Promise.all([
    supabase.rpc("admin_stats"),
    supabase.rpc("admin_audit_log", { p_role: "admin", p_limit: 8 }),
    supabase.rpc("admin_audit_log", { p_role: "system", p_action: "system.", p_limit: 8 }),
    supabase.rpc("admin_users", { p_sort: "rejections", p_limit: 5 }),
  ]);
  for (const r of [stats, adminLog, systemLog, suspicious]) if (r.error) console.error("admin overview", r.error.message);
  const s = (stats.data ?? {}) as Record<string, number>;
  const recent = [...((adminLog.data ?? []) as LogRow[]), ...((systemLog.data ?? []) as LogRow[])]
    .sort((a, b) => b.id - a.id).slice(0, 10);
  const flagged = ((suspicious.data ?? []) as UserRow[]).filter((u) => u.rejections > 0);

  return (
    <>
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {STATS.map((k) => (
          <div key={k} className="rounded-xl border border-gray-200 p-3 dark:border-gray-800">
            <p className="text-2xl font-semibold tabular-nums">{(s[k] ?? 0).toLocaleString("en-IN")}</p>
            <p className="text-xs text-gray-600 dark:text-gray-400">{t(`stat.${k}`)}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-medium">{t("recentAdmin")}</h2>
            <Link href="/admin/log?role=admin" className="text-sm text-blue-600 hover:underline">{t("seeAll")}</Link>
          </div>
          {recent.length === 0 ? <p className="text-sm text-gray-500">{t("noneYet")}</p> : (
            <ul className="divide-y divide-gray-100 text-sm dark:divide-gray-800">
              {recent.map((r) => (
                <li key={r.id} className="py-2">
                  <p><code className="text-xs">{r.action}</code> <Badge tone={r.actor_role === "system" ? "amber" : "blue"}>{t(`role.${r.actor_role}`)}</Badge></p>
                  <p className="text-xs text-gray-500">
                    {formatWhen(r.at, lang)} · {r.actor_name ?? t("role.system")}{r.details?.reason ? ` · “${r.details.reason}”` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-medium">{t("suspicious")}</h2>
            <Link href="/admin/users?sort=rejections" className="text-sm text-blue-600 hover:underline">{t("seeAll")}</Link>
          </div>
          {flagged.length === 0 ? <p className="text-sm text-gray-500">{t("noneYet")}</p> : (
            <ul className="divide-y divide-gray-100 text-sm dark:divide-gray-800">
              {flagged.map((u) => (
                <li key={u.id} className="flex items-center justify-between py-2">
                  <Link href={`/admin/users?q=${u.id}`} className="hover:underline">{u.display_name}</Link>
                  <span className="flex items-center gap-2">
                    {u.status === "removed" && <Badge tone="red">{t("status.removed")}</Badge>}
                    <span className="tabular-nums text-gray-600">{u.rejections}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
