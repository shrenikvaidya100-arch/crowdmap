// Admin: every account with search, status filter, sorting and paging.
// Remove hides the account and everything it posted; Restore brings it all back.
import Link from "next/link";
import { formatWhen } from "@/features/admin/format";
import { requireAdminPage } from "@/features/admin/guard";
import { messages } from "@/features/admin/messages";
import { Moderate } from "@/features/admin/Moderate";
import { Badge, Field, FilterBar, inputCls, Pager } from "@/features/admin/ui";
import { pageNumber, param, pick } from "@/features/admin/validation";
import { translator } from "@/lib/i18n";
import { getLang } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

const PER_PAGE = 25;
const STATUSES = ["", "active", "removed", "admin"] as const;
const SORTS = ["newest", "oldest", "name", "activity", "contributions", "rejections"] as const;

type Row = {
  id: string; display_name: string; email: string | null; role: string; status: string; removed_at: string | null;
  removed_reason: string | null; trust_score: number; is_sample: boolean; created_at: string;
  reports: number; alerts: number; media: number; comments: number; places_added: number; rejections: number;
  last_active: string | null; total: number;
};

export default async function AdminUsers({ searchParams }: PageProps<"/admin/users">) {
  await requireAdminPage();
  const sp = await searchParams;
  const q = param(sp, "q");
  const status = pick(param(sp, "status"), STATUSES, "");
  const sort = pick(param(sp, "sort"), SORTS, "newest");
  const page = pageNumber(param(sp, "page"));
  const [lang, supabase] = await Promise.all([getLang(), createClient()]);
  const t = translator(messages, lang);

  const { data, error } = await supabase.rpc("admin_users", {
    p_q: q ?? null, p_status: status || null, p_sort: sort, p_limit: PER_PAGE, p_offset: (page - 1) * PER_PAGE,
  });
  if (error) console.error("admin users", error.message);
  const rows = (data ?? []) as Row[];
  const total = Number(rows[0]?.total ?? 0);
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <>
      <FilterBar action="/admin/users" applyLabel={t("apply")} clearLabel={t("clear")}>
        <Field label={t("search")}>
          <input name="q" defaultValue={q} placeholder={t("searchUsers")} className={`${inputCls} w-56`} />
        </Field>
        <Field label={t("status")}>
          <select name="status" defaultValue={status} className={inputCls}>
            {STATUSES.map((s) => <option key={s} value={s}>{s ? t(`status.${s}`) : t("all")}</option>)}
          </select>
        </Field>
        <Field label={t("sort")}>
          <select name="sort" defaultValue={sort} className={inputCls}>
            {SORTS.map((s) => <option key={s} value={s}>{t(`sort.${s}`)}</option>)}
          </select>
        </Field>
      </FilterBar>

      <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-gray-50 text-xs text-gray-600 dark:bg-gray-900 dark:text-gray-400">
            <tr>
              <th className="px-3 py-2">{t("col.user")}</th>
              <th className="px-3 py-2">{t("col.activity")}</th>
              <th className="px-3 py-2">{t("col.rejections")}</th>
              <th className="px-3 py-2">{t("col.lastActive")}</th>
              <th className="px-3 py-2">{t("col.status")}</th>
              <th className="px-3 py-2">{t("col.actions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {rows.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-500">{t("noneYet")}</td></tr>}
            {rows.map((u) => (
              <tr key={u.id} className="align-top">
                <td className="px-3 py-2">
                  <p className="font-medium">
                    {u.display_name}{" "}
                    {u.role === "admin" && <Badge tone="blue">{t("adminBadge")}</Badge>}{" "}
                    {u.is_sample && <Badge tone="amber">{t("sample")}</Badge>}
                  </p>
                  <p className="text-xs text-gray-500">{u.email ?? "—"}</p>
                  <p className="text-xs text-gray-500">{t("col.joined")}: {formatWhen(u.created_at, lang)} · {t("col.trust")} {Math.round(u.trust_score * 100)}%</p>
                </td>
                <td className="px-3 py-2 tabular-nums">{u.reports} · {u.alerts} · {u.media} · {u.comments} · {u.places_added}</td>
                <td className={`px-3 py-2 tabular-nums ${u.rejections >= 10 ? "font-semibold text-red-700" : ""}`}>{u.rejections}</td>
                <td className="px-3 py-2 text-xs">{formatWhen(u.last_active, lang)}</td>
                <td className="px-3 py-2">
                  <Badge tone={u.status === "removed" ? "red" : "green"}>{t(`status.${u.status}`)}</Badge>
                  {u.status === "removed" && (
                    <p className="mt-1 max-w-56 text-xs text-gray-500">{t("removedBecause", { reason: u.removed_reason ?? "—" })} · {formatWhen(u.removed_at, lang)}</p>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap items-start gap-2">
                    {u.role !== "admin" && (u.status === "removed"
                      ? <Moderate lang={lang} target="user" id={u.id} to="active" label={t("restore")} />
                      : <Moderate lang={lang} target="user" id={u.id} to="removed" label={t("remove")} />)}
                    <Link href={`/admin/log?actor=${u.id}`} className="text-xs text-blue-600 hover:underline">{t("nav.log")}</Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager base="/admin/users" params={{ q, status, sort }} page={page} pages={pages}
             label={t("pageOf", { page, pages, total })} prev={t("prevPage")} next={t("nextPage")} />
    </>
  );
}
