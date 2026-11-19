// Admin: automatic bot detection. The rules, a "run now" button, and every
// finding with its evidence. Removed accounts can be restored from here.
import Link from "next/link";
import { RunSweep, ReviewFlag } from "@/features/admin/BotControls";
import { formatWhen } from "@/features/admin/format";
import { requireAdminPage } from "@/features/admin/guard";
import { messages } from "@/features/admin/messages";
import { Moderate } from "@/features/admin/Moderate";
import { Badge } from "@/features/admin/ui";
import { param, pick } from "@/features/admin/validation";
import { translator } from "@/lib/i18n";
import { getLang } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

const VIEWS = ["open", "all"] as const;
type Rule = { signal: string; window_min: number; threshold: number; points: number; label: string };
type Flag = {
  id: number; user_id: string; display_name: string; user_status: string; removed_reason: string | null; score: number;
  signals: Record<string, number>; outcome: "removed" | "flagged"; created_at: string; reviewed_at: string | null; reviewer: string | null;
};

export default async function AdminBots({ searchParams }: PageProps<"/admin/bots">) {
  await requireAdminPage();
  const view = pick(param(await searchParams, "view"), VIEWS, "open");
  const [lang, supabase] = await Promise.all([getLang(), createClient()]);
  const t = translator(messages, lang);
  const [rules, found] = await Promise.all([
    supabase.from("bot_rules").select("signal, window_min, threshold, points, label").order("points", { ascending: false }),
    supabase.rpc("admin_bot_flags", { p_open_only: view === "open", p_limit: 100 }),
  ]);
  if (rules.error) console.error("admin bot rules", rules.error.message);
  if (found.error) console.error("admin bot flags", found.error.message);
  const ruleList = (rules.data ?? []) as Rule[];
  const labels = Object.fromEntries(ruleList.map((r) => [r.signal, r.label]));
  const flags = (found.data ?? []) as Flag[];
  const span = (m: number) => m === 1440 ? t("day") : m % 1440 === 0 ? t("days", { n: m / 1440 }) : m % 60 === 0 ? t("hours", { n: m / 60 }) : t("minutes", { n: m });

  return (
    <>
      <section className="space-y-3 border border-zinc-900/20 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-sm text-gray-600 dark:text-gray-400">{t("bots.intro", { remove: 100, flag: 40 })}</p>
        <RunSweep lang={lang} />
      </section>

      <section>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 className="mr-2 font-medium">{t("bots.findings")}</h2>
          {VIEWS.map((v) => (
            <Link key={v} href={`/admin/bots?view=${v}`} aria-current={view === v ? "page" : undefined}
                  className={`border px-3 py-1 text-sm font-medium ${view === v ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900" : "border-zinc-900/25 text-zinc-700 hover:border-zinc-900 dark:border-zinc-700 dark:text-zinc-300"}`}>
              {v === "open" ? t("bots.open") : t("bots.allFindings")}
            </Link>
          ))}
        </div>
        {flags.length === 0 ? <p className="text-sm text-gray-500">{t("noneYet")}</p> : (
          <ul className="divide-y divide-gray-100 border border-zinc-900/20 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
            {flags.map((f) => (
              <li key={f.id} className="flex flex-wrap items-start justify-between gap-3 p-3 text-sm">
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <Link href={`/admin/users?q=${f.user_id}`} className="font-medium hover:underline">{f.display_name}</Link>
                    <Badge tone={f.outcome === "removed" ? "red" : "amber"}>{f.outcome === "removed" ? t("bots.removedAuto") : t("bots.flagged")}</Badge>
                    <span className="text-xs text-gray-500">{t("bots.score", { n: f.score })} · {formatWhen(f.created_at, lang)}</span>
                  </p>
                  <ul className="list-disc pl-5 text-xs text-gray-700 dark:text-gray-300">
                    {Object.entries(f.signals).map(([k, n]) => <li key={k}>{labels[k] ?? k}: {n}</li>)}
                  </ul>
                  {f.outcome === "removed" && f.user_status === "active" && <p className="text-xs text-green-700">{t("bots.nowActive")}</p>}
                  {f.reviewed_at && <p className="text-xs text-gray-500">{t("bots.reviewedBy", { who: f.reviewer ?? "?", when: formatWhen(f.reviewed_at, lang) })}</p>}
                </div>
                <div className="flex flex-col items-end gap-2">
                  {f.user_status === "removed" && <Moderate lang={lang} target="user" id={f.user_id} to="active" label={t("restore")} />}
                  {!f.reviewed_at && <ReviewFlag lang={lang} flagId={f.id} />}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-medium">{t("bots.rules")}</h2>
        <div className="overflow-x-auto border border-zinc-900/20 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-gray-50 text-xs text-gray-600 dark:bg-gray-900 dark:text-gray-400">
              <tr>
                <th className="px-3 py-2">{t("bots.rule")}</th><th className="px-3 py-2">{t("bots.window")}</th>
                <th className="px-3 py-2">{t("bots.threshold")}</th><th className="px-3 py-2">{t("bots.points")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {ruleList.map((r) => (
                <tr key={r.signal}>
                  <td className="px-3 py-2">{r.label}</td>
                  <td className="px-3 py-2">{span(r.window_min)}</td>
                  <td className="px-3 py-2 tabular-nums">{r.threshold}×</td>
                  <td className="px-3 py-2 tabular-nums">{r.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
