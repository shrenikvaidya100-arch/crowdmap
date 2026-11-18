// Admin: the append-only audit log with filters, newest first, paged by id,
// and a button that re-checks the whole hash chain.
import Link from "next/link";
import { formatWhen } from "@/features/admin/format";
import { requireAdminPage } from "@/features/admin/guard";
import { messages } from "@/features/admin/messages";
import { Badge, Field, FilterBar, inputCls } from "@/features/admin/ui";
import { param, pick } from "@/features/admin/validation";
import { VerifyChain } from "@/features/admin/VerifyChain";
import { translator } from "@/lib/i18n";
import { getLang } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

const PER_PAGE = 50;
const ROLES = ["", "user", "admin", "system", "anon"] as const;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

type Row = {
  id: number; at: string; actor_id: string | null; actor_name: string | null; actor_role: string; action: string;
  target_type: string | null; target_id: string | null; details: Record<string, unknown>; hash: string;
};

/** A yyyy-mm-dd date as the start of that day in India time. */
const istDay = (d: string | undefined, addDays = 0) => {
  if (!d || !DATE.test(d)) return null;
  const t = new Date(`${d}T00:00:00+05:30`);
  if (Number.isNaN(t.getTime())) return null;
  t.setUTCDate(t.getUTCDate() + addDays);
  return t.toISOString();
};

export default async function AdminLog({ searchParams }: PageProps<"/admin/log">) {
  await requireAdminPage();
  const sp = await searchParams;
  const filters = {
    action: param(sp, "action", 60), actor: param(sp, "actor", 60), target: param(sp, "target", 60),
    role: pick(param(sp, "role"), ROLES, ""), from: param(sp, "from", 10), to: param(sp, "to", 10),
  };
  const before = Number.parseInt(param(sp, "before") ?? "", 10);
  const [lang, supabase] = await Promise.all([getLang(), createClient()]);
  const t = translator(messages, lang);

  const { data, error } = await supabase.rpc("admin_audit_log", {
    p_action: filters.action ?? null, p_actor: filters.actor ?? null, p_target: filters.target ?? null,
    p_role: filters.role || null, p_from: istDay(filters.from), p_to: istDay(filters.to, 1),
    p_before: Number.isFinite(before) ? before : null, p_limit: PER_PAGE + 1,
  });
  if (error) console.error("admin log", error.message);
  const all = (data ?? []) as Row[];
  const rows = all.slice(0, PER_PAGE);
  const more = all.length > PER_PAGE;
  const query = (extra: Record<string, string>) => new URLSearchParams(
    Object.entries({ ...filters, ...extra }).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <>
      <section className="space-y-2 rounded-xl border border-gray-200 p-4 dark:border-gray-800">
        <p className="text-sm text-gray-600 dark:text-gray-400">{t("appendOnly")}</p>
        <VerifyChain lang={lang} />
      </section>

      <FilterBar action="/admin/log" applyLabel={t("apply")} clearLabel={t("clear")}>
        <Field label={t("actionPrefix")}><input name="action" defaultValue={filters.action} className={`${inputCls} w-52`} /></Field>
        <Field label={t("actor")}><input name="actor" defaultValue={filters.actor} className={`${inputCls} w-44`} /></Field>
        <Field label={t("target")}><input name="target" defaultValue={filters.target} className={`${inputCls} w-44`} /></Field>
        <Field label={t("role")}>
          <select name="role" defaultValue={filters.role} className={inputCls}>
            {ROLES.map((r) => <option key={r} value={r}>{r ? t(`role.${r}`) : t("all")}</option>)}
          </select>
        </Field>
        <Field label={t("from")}><input type="date" name="from" defaultValue={filters.from} className={inputCls} /></Field>
        <Field label={t("to")}><input type="date" name="to" defaultValue={filters.to} className={inputCls} /></Field>
      </FilterBar>

      <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="bg-gray-50 text-xs text-gray-600 dark:bg-gray-900 dark:text-gray-400">
            <tr>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">{t("col.when")}</th>
              <th className="px-3 py-2">{t("col.who")}</th>
              <th className="px-3 py-2">{t("col.action")}</th>
              <th className="px-3 py-2">{t("col.target")}</th>
              <th className="px-3 py-2">{t("col.details")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 align-top dark:divide-gray-800">
            {rows.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-500">{t("noneYet")}</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2 tabular-nums text-xs text-gray-500" title={`hash ${r.hash}`}>{r.id}</td>
                <td className="whitespace-nowrap px-3 py-2 text-xs">{formatWhen(r.at, lang)}</td>
                <td className="px-3 py-2 text-xs">
                  {r.actor_id
                    ? <Link href={`/admin/log?actor=${r.actor_id}`} className="hover:underline">{r.actor_name ?? r.actor_id.slice(0, 8)}</Link>
                    : "—"}{" "}
                  <Badge tone={r.actor_role === "admin" ? "blue" : r.actor_role === "system" ? "amber" : "gray"}>{t(`role.${r.actor_role}`)}</Badge>
                </td>
                <td className="px-3 py-2"><Link href={`/admin/log?action=${r.action}`} className="font-mono text-xs hover:underline">{r.action}</Link></td>
                <td className="px-3 py-2 text-xs">
                  {r.target_id ? <Link href={`/admin/log?target=${r.target_id}`} className="hover:underline">{r.target_type}:{r.target_id.slice(0, 8)}</Link> : (r.target_type ?? "—")}
                </td>
                <td className="max-w-md px-3 py-2">
                  {Object.keys(r.details ?? {}).length > 0 && (
                    <pre className="whitespace-pre-wrap break-all font-mono text-[11px] text-gray-600 dark:text-gray-400">{JSON.stringify(r.details)}</pre>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-between text-sm">
        {Number.isFinite(before) ? <Link href={`/admin/log?${query({})}`} className="text-blue-600 hover:underline">{t("prev")}</Link> : <span />}
        {more && <Link href={`/admin/log?${query({ before: String(rows[rows.length - 1].id) })}`} className="text-blue-600 hover:underline">{t("next")}</Link>}
      </div>
    </>
  );
}
