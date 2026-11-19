// Admin: uploads and comments, with search, status filter and paging.
// Hiding keeps the item (and its file) so it can be shown again.
import Link from "next/link";
import { formatWhen } from "@/features/admin/format";
import { requireAdminPage } from "@/features/admin/guard";
import { messages } from "@/features/admin/messages";
import { Moderate } from "@/features/admin/Moderate";
import { ReportActions } from "@/features/admin/ReportActions";
import { Badge, Field, FilterBar, inputCls, Pager } from "@/features/admin/ui";
import { pageNumber, param, pick } from "@/features/admin/validation";
import { mediaConfig } from "@/features/media/config";
import type { Language } from "@/lib/config";
import { translator } from "@/lib/i18n";
import { getLang } from "@/lib/i18n/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const TYPES = ["media", "comments"] as const;
const STATUSES = ["", "visible", "removed"] as const;
type T = ReturnType<typeof translator>;

type MediaRow = {
  id: string; kind: string; caption: string | null; duration_s: number | null; storage_path: string; status: string;
  removed_by: string | null; removed_reason: string | null; created_at: string; user_id: string; author: string;
  author_status: string; place_name: string; comment_count: number; total: number;
};
type Reported = {
  media_id: string; kind: string; caption: string | null; storage_path: string; author: string; place_name: string;
  reports: number; reasons: string[]; notes: string[]; first_at: string;
};
type CommentRow = {
  id: string; body: string; status: string; removed_by: string | null; removed_reason: string | null; created_at: string;
  user_id: string; author: string; author_status: string; media_kind: string; place_name: string; total: number;
};

export default async function AdminContent({ searchParams }: PageProps<"/admin/content">) {
  await requireAdminPage();
  const sp = await searchParams;
  const type = pick(param(sp, "type"), TYPES, "media");
  const q = param(sp, "q");
  const status = pick(param(sp, "status"), STATUSES, "");
  const page = pageNumber(param(sp, "page"));
  const per = type === "media" ? 20 : 40;
  const [lang, supabase] = await Promise.all([getLang(), createClient()]);
  const t = translator(messages, lang);

  const queue = await supabase.rpc("admin_report_queue");
  if (queue.error) console.error("admin report queue", queue.error.message);
  const reported = (queue.data ?? []) as Reported[];
  const { data, error } = await supabase.rpc(type === "media" ? "admin_media" : "admin_comments", {
    p_status: status || null, p_q: q ?? null, p_limit: per, p_offset: (page - 1) * per,
  });
  if (error) console.error("admin content", error.message);
  const rows = (data ?? []) as (MediaRow | CommentRow)[];
  const total = Number(rows[0]?.total ?? 0);
  const pages = Math.max(1, Math.ceil(total / per));

  return (
    <>
      <section className="border border-amber-700/40 bg-amber-50/40 p-4 dark:border-amber-900 dark:bg-amber-950/20">
        <h2 className="mb-2 font-medium">{t("reports.title")}</h2>
        {reported.length === 0 ? <p className="text-sm text-gray-500">{t("reports.none")}</p> : (
          <ul className="divide-y divide-amber-100 dark:divide-amber-900/50">
            {reported.map((r) => (
              <li key={r.media_id} className="flex flex-wrap items-start justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{r.caption || t(r.kind)} <span className="font-normal text-gray-500">· {r.author} · {t("onPlace", { place: r.place_name })}</span></p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    {t("reports.count", { n: r.reports })}: {r.reasons.map((x) => t(`reason.${x}`)).join(", ")}
                    {r.notes.length > 0 && <> · &ldquo;{r.notes.slice(0, 2).join("”, “")}&rdquo;</>}
                  </p>
                </div>
                <ReportActions mediaId={r.media_id} keepLabel={t("reports.keep")} hideLabel={t("reports.hide")}
                               hideItemLabel={t("reports.hideItem", { name: r.caption || r.place_name })} holdingLabel={t("reports.holding")} hiddenLabel={t("reports.hidden")} />
              </li>
            ))}
          </ul>
        )}
      </section>
      <div className="flex gap-2">
        {TYPES.map((k) => (
          <Link key={k} href={`/admin/content?type=${k}`} aria-current={type === k ? "page" : undefined}
                className={`border px-3 py-1 text-sm font-medium ${type === k ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900" : "border-zinc-900/25 text-zinc-700 hover:border-zinc-900 dark:border-zinc-700 dark:text-zinc-300"}`}>
            {t(k)}
          </Link>
        ))}
      </div>
      <FilterBar action="/admin/content" applyLabel={t("apply")} clearLabel={t("clear")}>
        <input type="hidden" name="type" value={type} />
        <Field label={t("search")}>
          <input name="q" defaultValue={q} placeholder={t("searchContent")} className={`${inputCls} w-56`} />
        </Field>
        <Field label={t("status")}>
          <select name="status" defaultValue={status} className={inputCls}>
            {STATUSES.map((s) => <option key={s} value={s}>{s ? t(`status.${s}`) : t("all")}</option>)}
          </select>
        </Field>
      </FilterBar>

      {rows.length === 0 && <p className="text-sm text-gray-500">{t("noneYet")}</p>}
      {type === "media"
        ? <MediaGrid rows={rows as MediaRow[]} lang={lang} t={t} />
        : <CommentList rows={rows as CommentRow[]} lang={lang} t={t} />}

      <Pager base="/admin/content" params={{ type, q, status }} page={page} pages={pages}
             label={t("pageOf", { page, pages, total })} prev={t("prevPage")} next={t("nextPage")} />
    </>
  );
}

function Who({ row, lang, t }: { row: { author: string; author_status: string; user_id: string; created_at: string; place_name: string }; lang: Language; t: T }) {
  return (
    <p className="text-xs text-gray-500">
      <Link href={`/admin/users?q=${row.user_id}`} className="hover:underline">{row.author}</Link>
      {row.author_status === "removed" && <> <Badge tone="red">{t("status.removed")}</Badge></>}
      {" · "}{t("onPlace", { place: row.place_name })} · {formatWhen(row.created_at, lang)}
    </p>
  );
}

function StatusLine({ row, t }: { row: { status: string; removed_by: string | null; removed_reason: string | null }; t: T }) {
  if (row.status !== "removed") return <Badge tone="green">{t("status.visible")}</Badge>;
  return (
    <p className="text-xs">
      <Badge tone="red">{t("status.removed")}</Badge>{" "}
      <span className="text-gray-500">{t("by", { who: row.removed_by ?? "?" })}{row.removed_reason ? `: “${row.removed_reason}”` : ""}</span>
    </p>
  );
}

async function MediaGrid({ rows, lang, t }: { rows: MediaRow[]; lang: Language; t: T }) {
  // Admins see hidden items too; links are signed per request and expire.
  const urls = new Map<string, string>();
  if (rows.length) {
    const { data } = await createServiceClient().storage.from("media")
      .createSignedUrls(rows.map((r) => r.storage_path), mediaConfig.signedUrlSeconds);
    for (const s of data ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((m) => {
        const url = urls.get(m.storage_path);
        return (
          <article key={m.id} className={`overflow-hidden rounded-xl border ${m.status === "removed" ? "border-red-200 dark:border-red-900" : "border-gray-200 dark:border-gray-800"}`}>
            {url && (m.kind === "photo"
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={url} alt={m.caption ?? ""} loading="lazy" className="h-48 w-full bg-black object-contain" />
              : m.kind === "video" ? <video src={url} controls preload="metadata" className="h-48 w-full bg-black" />
              : <div className="p-3"><audio src={url} controls preload="metadata" className="w-full" /></div>)}
            <div className="space-y-1.5 p-3 text-sm">
              {m.caption && <p className="break-words">{m.caption}</p>}
              <Who row={m} lang={lang} t={t} />
              <p className="text-xs text-gray-500">{m.kind}{m.duration_s != null ? ` · ${Math.round(m.duration_s)}s` : ""} · {t("commentsCount", { n: m.comment_count })}</p>
              <StatusLine row={m} t={t} />
              {m.status === "removed"
                ? <Moderate lang={lang} target="media" id={m.id} to="visible" label={t("show")} />
                : <Moderate lang={lang} target="media" id={m.id} to="removed" label={t("hide")} />}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function CommentList({ rows, lang, t }: { rows: CommentRow[]; lang: Language; t: T }) {
  return (
    <ul className="divide-y divide-gray-100 border border-zinc-900/20 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
      {rows.map((c) => (
        <li key={c.id} className={`flex flex-wrap items-start justify-between gap-3 p-3 ${c.status === "removed" ? "bg-red-50/50 dark:bg-red-950/30" : ""}`}>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="whitespace-pre-wrap break-words text-sm">{c.body}</p>
            <Who row={c} lang={lang} t={t} />
            <StatusLine row={c} t={t} />
          </div>
          {c.status === "removed"
            ? <Moderate lang={lang} target="comment" id={c.id} to="visible" label={t("show")} />
            : <Moderate lang={lang} target="comment" id={c.id} to="removed" label={t("hide")} />}
        </li>
      ))}
    </ul>
  );
}
