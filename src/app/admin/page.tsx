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

const GROUPS: [string, string[]][] = [
  ["people", ["users", "users_new_24h", "users_removed", "admins"]],
  ["today", ["reports_24h", "alerts_active", "rejections_24h", "places_unconfirmed"]],
  ["content", ["media_visible", "media_removed", "comments_visible", "comments_removed"]],
  ["record", ["audit_entries"]],
];
// Numbers that need a look when they're above zero.
const WATCH = new Set(["rejections_24h", "places_unconfirmed"]);

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
      {/* The numbers, grouped like a ledger: one ruled row per group. */}
      <section className="border-y-2 border-zinc-900 dark:border-zinc-100">
        {GROUPS.map(([group, keys]) => (
          <div key={group} className="grid gap-x-6 border-b border-zinc-900/15 py-3 last:border-b-0 sm:grid-cols-[9rem_1fr] dark:border-zinc-800">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500 sm:pt-2">{t(`group.${group}`)}</p>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
              {keys.map((k) => (
                <div key={k}>
                  <dd className={`font-mono text-2xl tabular-nums ${WATCH.has(k) && (s[k] ?? 0) > 0 ? "text-red-700 dark:text-red-400" : ""}`}>{(s[k] ?? 0).toLocaleString("en-IN")}</dd>
                  <dt className="text-xs text-zinc-600 dark:text-zinc-400">{t(`stat.${k}`)}</dt>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <div className="mb-2 flex items-baseline justify-between border-b border-zinc-900 pb-1 dark:border-zinc-100">
            <h2 className="font-serif text-lg font-semibold">{t("recentAdmin")}</h2>
            <Link href="/admin/log?role=admin" className="text-sm underline underline-offset-2 hover:no-underline">{t("seeAll")}</Link>
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

        <section>
          <div className="mb-2 flex items-baseline justify-between border-b border-zinc-900 pb-1 dark:border-zinc-100">
            <h2 className="font-serif text-lg font-semibold">{t("suspicious")}</h2>
            <Link href="/admin/users?sort=rejections" className="text-sm underline underline-offset-2 hover:no-underline">{t("seeAll")}</Link>
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
