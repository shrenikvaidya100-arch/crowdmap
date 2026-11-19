// Admin overview (Watermelon UI look): key numbers as glowing cards, charts of how
// the site is working day by day, then recent admin/system actions and the
// accounts with the most GPS rejections (a strong bot signal).
import Link from "next/link";
import { GlowCard } from "@/components/watermelon-ui/glow-card";
import { Icon, type IconName } from "@/components/icons/Icon";
import { setMediaLocationRequired } from "@/features/admin/actions";
import { AdminCharts, type DashData } from "@/features/admin/AdminCharts";
import { formatWhen } from "@/features/admin/format";
import { requireAdminPage } from "@/features/admin/guard";
import { messages } from "@/features/admin/messages";
import { Badge } from "@/features/admin/ui";
import { pick } from "@/features/admin/validation";
import { translator } from "@/lib/i18n";
import { getLang } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

// Key numbers: [stat key, icon, glow colour (r,g,b)].
const KPIS: [string, IconName, string][] = [
  ["users", "users", "59,130,246"],
  ["users_new_24h", "user", "139,92,246"],
  ["reports_24h", "live", "16,185,129"],
  ["rejections_24h", "shield", "244,63,94"],
  ["alerts_active", "warning", "245,158,11"],
  ["media_visible", "image", "20,184,166"],
];
// The rest, as a compact list.
const MORE = ["users_removed", "admins", "media_removed", "comments_visible", "comments_removed", "places_unconfirmed", "audit_entries"] as const;
// Numbers that need a look when they're above zero.
const WATCH = new Set(["rejections_24h", "places_unconfirmed"]);
const RANGES = ["14", "30", "90"] as const;

type LogRow = { id: number; at: string; actor_name: string | null; actor_role: string; action: string; target_type: string | null; details: { reason?: string } };
type UserRow = { id: string; display_name: string; status: string; rejections: number; created_at: string };

export default async function AdminOverview({ searchParams }: PageProps<"/admin">) {
  await requireAdminPage();
  const sp = await searchParams;
  const range = pick(typeof sp.range === "string" ? sp.range : undefined, [...RANGES], "30");
  const lang = await getLang();
  const t = translator(messages, lang);
  const supabase = await createClient();
  const [stats, dash, adminLog, systemLog, suspicious, mediaLoc] = await Promise.all([
    supabase.rpc("admin_stats"),
    supabase.rpc("admin_dashboard", { p_days: Number(range) }),
    supabase.rpc("admin_audit_log", { p_role: "admin", p_limit: 8 }),
    supabase.rpc("admin_audit_log", { p_role: "system", p_action: "system.", p_limit: 8 }),
    supabase.rpc("admin_users", { p_sort: "rejections", p_limit: 5 }),
    supabase.rpc("media_location_required"),
  ]);
  const locationRequired = mediaLoc.data !== false;
  for (const r of [stats, dash, adminLog, systemLog, suspicious]) if (r.error) console.error("admin overview", r.error.message);
  const s = (stats.data ?? {}) as Record<string, number>;
  const d = (dash.data ?? { days: [], levels: null, cities: [], quorum: { confirmed: 0, waiting: 0 } }) as DashData;
  const recent = [...((adminLog.data ?? []) as LogRow[]), ...((systemLog.data ?? []) as LogRow[])]
    .sort((a, b) => b.id - a.id).slice(0, 10);
  const flagged = ((suspicious.data ?? []) as UserRow[]).filter((u) => u.rejections > 0);
  const card = "rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_12px_-4px_rgba(0,0,0,0.06)] dark:border-zinc-800 dark:bg-zinc-950";

  const chartLabels = Object.fromEntries([
    "reports", "rejected", "signups", "uploads", "searches", "alerts", "moderation", "confirmed", "waiting", "none",
    "activityTitle", "activityNote", "quorumTitle", "quorumNote", "peopleTitle", "usageTitle", "levelsTitle", "citiesTitle",
  ].map((k) => [k, t(`chart.${k}`)]).concat([1, 2, 3, 4, 5].map((l) => [`level${l}`, t(`chart.level${l}`)])));

  return (
    <>
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {KPIS.map(([k, icon, rgb]) => (
          <GlowCard key={k} glowColor={`rgba(${rgb},0.75)`} stripe={`rgba(${rgb},0.10)`}>
            <span className="grid h-9 w-9 place-items-center rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
                  style={{ color: `rgb(${rgb})` }}><Icon name={icon} size={17} /></span>
            <div className="mt-4">
              <p className={`text-3xl font-bold tracking-tight tabular-nums ${WATCH.has(k) && (s[k] ?? 0) > 0 ? "text-rose-600" : "text-zinc-900 dark:text-zinc-50"}`}>
                {(s[k] ?? 0).toLocaleString("en-IN")}
              </p>
              <p className="mt-0.5 text-xs font-medium text-zinc-500">{t(`stat.${k}`)}</p>
            </div>
          </GlowCard>
        ))}
      </section>

      {/* Switch: must photos, videos and voice notes be posted from the place? */}
      <form action={setMediaLocationRequired} className={`${card} flex flex-wrap items-center justify-between gap-3`}>
        <div className="min-w-0">
          <p className="text-sm font-semibold">{t("mediaLoc.title")}</p>
          <p className="text-xs text-zinc-500">{t(locationRequired ? "mediaLoc.on" : "mediaLoc.off")}</p>
        </div>
        <input type="hidden" name="required" value={locationRequired ? "false" : "true"} />
        <button className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold shadow-sm transition ${locationRequired ? "bg-emerald-600 text-white hover:bg-emerald-500" : "bg-amber-500 text-white hover:bg-amber-400"}`}>
          <span className="h-2 w-2 rounded-full bg-white" />{t(locationRequired ? "mediaLoc.turnOff" : "mediaLoc.turnOn")}
        </button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{t("chart.heading")}</h2>
        <nav aria-label={t("chart.range")} className="flex gap-1 rounded-full bg-zinc-100 p-1 dark:bg-zinc-900">
          {RANGES.map((r) => (
            <Link key={r} href={`/admin?range=${r}`} aria-current={r === range ? "page" : undefined}
                  className={`rounded-full px-3 py-1 text-sm font-medium transition ${r === range ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-white" : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"}`}>
              {t("chart.days", { n: r })}
            </Link>
          ))}
        </nav>
      </div>
      <AdminCharts data={d} labels={chartLabels} />

      <div className="grid gap-5 lg:grid-cols-3">
        <section className={`${card} lg:col-span-1`}>
          <h2 className="text-sm font-semibold">{t("more")}</h2>
          <dl className="mt-3 divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
            {MORE.map((k) => (
              <div key={k} className="flex items-center justify-between py-2">
                <dt className="text-zinc-600 dark:text-zinc-400">{t(`stat.${k}`)}</dt>
                <dd className={`font-semibold tabular-nums ${WATCH.has(k) && (s[k] ?? 0) > 0 ? "text-rose-600" : ""}`}>{(s[k] ?? 0).toLocaleString("en-IN")}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className={`${card} lg:col-span-1`}>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">{t("recentAdmin")}</h2>
            <Link href="/admin/log?role=admin" className="text-xs font-medium text-blue-600 hover:underline">{t("seeAll")}</Link>
          </div>
          {recent.length === 0 ? <p className="text-sm text-zinc-500">{t("noneYet")}</p> : (
            <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
              {recent.map((r) => (
                <li key={r.id} className="py-2">
                  <p className="flex flex-wrap items-center gap-1.5"><code className="text-xs">{r.action}</code> <Badge tone={r.actor_role === "system" ? "amber" : "blue"}>{t(`role.${r.actor_role}`)}</Badge></p>
                  <p className="text-xs text-zinc-500">
                    {formatWhen(r.at, lang)} · {r.actor_name ?? t("role.system")}{r.details?.reason ? ` · “${r.details.reason}”` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={`${card} lg:col-span-1`}>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">{t("suspicious")}</h2>
            <Link href="/admin/users?sort=rejections" className="text-xs font-medium text-blue-600 hover:underline">{t("seeAll")}</Link>
          </div>
          {flagged.length === 0 ? <p className="text-sm text-zinc-500">{t("noneYet")}</p> : (
            <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
              {flagged.map((u) => (
                <li key={u.id} className="flex items-center justify-between py-2">
                  <Link href={`/admin/users?q=${u.id}`} className="hover:underline">{u.display_name}</Link>
                  <span className="flex items-center gap-2">
                    {u.status === "removed" && <Badge tone="red">{t("status.removed")}</Badge>}
                    <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold tabular-nums text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{u.rejections}</span>
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
