// Admin: what people search for, and how many interests (saved places and
// reminders) there are. Counts come from the database already aggregated;
// searches carry no identities.
import Link from "next/link";
import ActivityTerrain from "@/components/core/activity-terrain";
import { formatWhen } from "@/features/admin/format";
import { requireAdminPage } from "@/features/admin/guard";
import { messages } from "@/features/admin/messages";
import { Pager } from "@/features/admin/ui";
import { pageNumber, param, pick } from "@/features/admin/validation";
import { translator } from "@/lib/i18n";
import { getLang } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

const RANGES = { "30": 30, "90": 90, "365": 365 } as const;
type Range = keyof typeof RANGES;
const PER_PAGE = 50;

type Day = { day: string; n: number };
type Search = { at: string; query: string; city_id: string | null; results: number; signed_in: boolean; total: number };
type Interests = { daily: Day[]; total: number; saved: number; reminders: number; users: number; top: { id: string; name: string; city_id: string; n: number }[] };

export default async function AdminInsights({ searchParams }: PageProps<"/admin/insights">) {
  await requireAdminPage();
  const sp = await searchParams;
  const range = pick(param(sp, "range"), Object.keys(RANGES) as Range[], "90");
  const page = pageNumber(param(sp, "page"));
  const days = RANGES[range];
  const [lang, supabase] = await Promise.all([getLang(), createClient()]);
  const t = translator(messages, lang);
  const [searches, recent, interests] = await Promise.all([
    supabase.rpc("admin_search_daily", { p_days: days }),
    supabase.rpc("admin_recent_searches", { p_limit: PER_PAGE, p_offset: (page - 1) * PER_PAGE }),
    supabase.rpc("admin_interest_stats", { p_days: days }),
  ]);
  for (const r of [searches, recent, interests]) if (r.error) console.error("admin insights", r.error.message);
  const searchDays = (searches.data ?? []) as Day[];
  const rows = (recent.data ?? []) as Search[];
  const total = Number(rows[0]?.total ?? 0);
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const i = (interests.data ?? { daily: [], total: 0, saved: 0, reminders: 0, users: 0, top: [] }) as Interests;
  const end = searchDays.at(-1)?.day ?? new Date().toISOString().slice(0, 10);
  const searchTotal = searchDays.reduce((s, d) => s + d.n, 0);

  const rangeLinks = (
    <div className="flex gap-1.5">
      {(Object.keys(RANGES) as Range[]).map((r) => (
        <Link key={r} href={`/admin/insights?range=${r}`} aria-current={r === range ? "page" : undefined}
              className={`rounded-full border px-3 py-1 text-sm ${r === range ? "border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-900" : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"}`}>
          {t(`insights.range.${r}`)}
        </Link>
      ))}
    </div>
  );

  return (
    <>
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{t("insights.searches")}</h2>
            <p className="text-sm text-gray-500">{t("insights.searchesNote", { n: searchTotal.toLocaleString("en-IN") })}</p>
          </div>
          {rangeLinks}
        </div>
        <ActivityTerrain key={`s-${range}`} title={t("insights.searches")} data={searchDays.map((d) => d.n)} endDate={end} />
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="bg-gray-50 text-xs text-gray-600 dark:bg-gray-900 dark:text-gray-400">
              <tr><th className="px-3 py-2">{t("col.when")}</th><th className="px-3 py-2">{t("insights.query")}</th>
                <th className="px-3 py-2">{t("insights.city")}</th><th className="px-3 py-2">{t("insights.results")}</th>
                <th className="px-3 py-2">{t("insights.who")}</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {rows.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-500">{t("noneYet")}</td></tr>}
              {rows.map((r, n) => (
                <tr key={`${r.at}-${n}`}>
                  <td className="whitespace-nowrap px-3 py-2 text-xs">{formatWhen(r.at, lang)}</td>
                  <td className="px-3 py-2">{r.query}</td>
                  <td className="px-3 py-2 text-xs">{r.city_id ?? "—"}</td>
                  <td className="px-3 py-2 tabular-nums">{r.results}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{r.signed_in ? t("insights.signedIn") : t("insights.visitor")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager base="/admin/insights" params={{ range }} page={page} pages={pages}
               label={t("pageOf", { page, pages, total })} prev={t("prevPage")} next={t("nextPage")} />
      </section>

      <section className="space-y-4 border-t border-gray-200 pt-6 dark:border-gray-800">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{t("insights.interests")}</h2>
            <p className="text-sm text-gray-500">{t("insights.interestsNote")}</p>
          </div>
          {rangeLinks}
        </div>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[["insights.total", i.total], ["insights.saved", i.saved], ["insights.reminders", i.reminders], ["insights.users", i.users]].map(([k, v]) => (
            <div key={k as string} className="rounded-2xl border border-zinc-200 bg-white shadow-sm p-3 dark:border-zinc-800 dark:bg-zinc-900">
              <dd className="text-2xl font-semibold tabular-nums">{Number(v).toLocaleString("en-IN")}</dd>
              <dt className="text-xs text-gray-600 dark:text-gray-400">{t(k as string)}</dt>
            </div>
          ))}
        </dl>
        <ActivityTerrain key={`i-${range}`} title={t("insights.interests")} data={i.daily.map((d) => d.n)} endDate={i.daily.at(-1)?.day ?? end} />
        <div>
          <h3 className="mb-2 font-medium">{t("insights.top")}</h3>
          {i.top.length === 0 ? <p className="text-sm text-gray-500">{t("noneYet")}</p> : (
            <ol className="divide-y divide-gray-100 rounded-2xl border border-zinc-200 bg-white shadow-sm dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
              {i.top.map((p, n) => (
                <li key={p.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span><span className="mr-2 tabular-nums text-gray-400">{n + 1}</span>
                    <Link href={`/map?place=${p.id}`} className="hover:underline">{p.name}</Link>
                    <span className="ml-2 text-xs text-gray-500">{p.city_id}</span></span>
                  <span className="tabular-nums text-gray-600">{p.n}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>
    </>
  );
}
