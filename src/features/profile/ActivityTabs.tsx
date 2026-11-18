"use client";
import { Icon } from "@/components/icons/Icon";
import HoldButton from "@/components/core/hold-button";
// "My activity" tabs: each is a table with a text filter, city filter and
// sorting, plus change/delete/cancel where the rules allow it.
// Writes reuse User 1's server actions; the database enforces who may do what.
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { config, type Language } from "@/lib/config";
import { translator } from "@/lib/i18n";
import { deleteCrowdReport, deleteQuickReport, updateCrowdReport } from "@/features/crowd/actions";
import { quickIcon, categoryIcon } from "@/features/crowd/config";
import { messages as crowdMessages } from "@/features/crowd/messages";
import { cancelPlan } from "@/features/crowd/plan/actions";
import { deleteMyPlace } from "@/features/places/actions";
import { deleteComment, deleteMedia } from "@/features/media/actions";
import { MEDIA_ICON, type MediaKind } from "@/features/media/config";
import { messages } from "./messages";

type PlaceRef = { id: string; name: string; name_hi: string | null; city_id: string } | null;
export type ReportRow = { id: string; level: number; created_at: string; place: PlaceRef };
export type AlertRow = { id: string; kind: string; created_at: string; expires_at: string; still_there: number; gone: number; place: PlaceRef };
export type PlanRow = { id: string; planned_for: string; place: PlaceRef };
export type AddedPlaceRow = { id: string; name: string; name_hi: string | null; category: string; status: string; created_at: string; city_id: string };
export type UploadRow = { id: string; kind: MediaKind; caption: string | null; status: string; removed_by: string | null; created_at: string; place: PlaceRef };
export type CommentRow = { id: string; body: string; status: string; created_at: string; media_kind: MediaKind; place: PlaceRef };
export type LogRow = { id: number; at: string; action: string; target_type: string | null; details: Record<string, unknown> };

type Tab = "profile" | "reports" | "alerts" | "uploads" | "comments" | "plans" | "places" | "log";
type Sort = "newest" | "oldest" | "name" | "level";

const levelColor = (l: number) => config.crowd.levels.find((x) => x.level === l)?.color ?? config.crowd.noDataColor;
const EDIT_MINUTES = 15;

export function ActivityTabs({
  lang, now, cityNames, profile, reports, alerts, uploads, comments, plans, places, log: logRows,
}: {
  lang: Language;
  /** Server time when the page was rendered (keeps "ago" and "editable" stable). */
  now: number;
  cityNames: Record<string, string>;
  profile: ReactNode;
  reports: ReportRow[];
  alerts: AlertRow[];
  plans: PlanRow[];
  places: AddedPlaceRow[];
  uploads: UploadRow[];
  comments: CommentRow[];
  /** Only admins see their activity log; leave it out to hide the tab. */
  log?: LogRow[];
}) {
  const t = translator(messages, lang);
  const tc = translator(crowdMessages, lang);
  const log = useMemo(() => logRows ?? [], [logRows]);
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("profile");
  const [q, setQ] = useState("");
  const [city, setCity] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; key: string } | null>(null);

  const fmt = (iso: string) => new Intl.DateTimeFormat(lang === "hi" ? "hi-IN" : "en-IN", {
    day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata",
  }).format(new Date(iso));
  const placeName = (p: PlaceRef) => (p ? (lang === "hi" && p.name_hi) || p.name : "—");

  async function run(id: string, fn: () => Promise<{ ok: boolean; reason?: string }>, confirmKey?: string) {
    if (confirmKey && !window.confirm(t(confirmKey))) return;
    setBusy(id);
    setNotice(null);
    const r = await fn();
    setBusy(null);
    setNotice({ ok: r.ok, key: r.ok ? "result.ok" : `result.${r.reason ?? "error"}` });
    if (r.ok) router.refresh();
  }

  // Shared filtering and sorting for the place-based tabs.
  function arrange<T>(rows: T[], get: {
    place: (r: T) => PlaceRef; date: (r: T) => string; level?: (r: T) => number;
    /** Extra searchable text (caption, comment), besides the place name. */
    text?: (r: T) => string | null;
  }) {
    const needle = q.trim().toLowerCase();
    const out = rows.filter((r) => {
      const p = get.place(r);
      if (city && p?.city_id !== city) return false;
      if (!needle) return true;
      return [p?.name, p?.name_hi, get.text?.(r)].some((s) => s?.toLowerCase().includes(needle));
    });
    out.sort((a, b) => {
      if (sort === "name") return placeName(get.place(a)).localeCompare(placeName(get.place(b)));
      if (sort === "level" && get.level) return get.level(b) - get.level(a);
      const d = new Date(get.date(b)).getTime() - new Date(get.date(a)).getTime();
      return sort === "oldest" ? -d : d;
    });
    return out;
  }

  const shownReports = useMemo(() => arrange(reports, { place: (r) => r.place, date: (r) => r.created_at, level: (r) => r.level }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reports, q, city, sort, lang]);
  const shownAlerts = useMemo(() => arrange(alerts, { place: (r) => r.place, date: (r) => r.created_at }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [alerts, q, city, sort, lang]);
  const shownUploads = useMemo(() => arrange(uploads, { place: (r) => r.place, date: (r) => r.created_at, text: (r) => r.caption }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [uploads, q, city, sort, lang]);
  const shownComments = useMemo(() => arrange(comments, { place: (r) => r.place, date: (r) => r.created_at, text: (r) => r.body }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [comments, q, city, sort, lang]);
  const shownPlans = useMemo(() => arrange(plans, { place: (r) => r.place, date: (r) => r.planned_for }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plans, q, city, sort, lang]);
  const shownPlaces = useMemo(() => arrange(places, {
    place: (r) => ({ id: r.id, name: r.name, name_hi: r.name_hi, city_id: r.city_id }), date: (r) => r.created_at,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [places, q, city, sort, lang]);
  const shownLog = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = log.filter((r) => !needle || r.action.includes(needle) || JSON.stringify(r.details).toLowerCase().includes(needle));
    return sort === "oldest" ? [...out].reverse() : out;
  }, [log, q, sort]);

  const counts: Record<Tab, number | null> = {
    profile: null, reports: reports.length, alerts: alerts.length, uploads: uploads.length, comments: comments.length,
    plans: plans.length, places: places.length, log: logRows ? log.length : null,
  };

  const th = "px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500";
  const td = "px-3 py-2 align-middle";
  const linkBtn = "text-sm hover:underline disabled:opacity-50";

  return (
    <div>
      <div role="tablist" className="mb-4 flex gap-1 overflow-x-auto border-b border-gray-200 [scrollbar-width:none] dark:border-gray-800">
        {(Object.keys(counts) as Tab[]).filter((k) => k !== "log" || logRows).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k}
                  onClick={() => { setTab(k); setQ(""); setCity(""); setSort("newest"); setNotice(null); }}
                  className={`shrink-0 border-b-2 px-3 py-2 text-sm font-medium ${tab === k ? "border-blue-600 text-blue-600" : "border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"}`}>
            {t(`tab.${k}`)}{counts[k] !== null && <span className="ml-1.5 rounded-full bg-gray-100 px-1.5 text-xs dark:bg-gray-800">{counts[k]}</span>}
          </button>
        ))}
      </div>

      {tab === "profile" ? profile : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} aria-label={t("search")}
                   maxLength={60} className="w-48 rounded-md border border-gray-300 bg-transparent px-3 py-1.5 text-sm dark:border-gray-600" />
            {tab !== "log" && (
              <select value={city} onChange={(e) => setCity(e.target.value)} aria-label={t("city")}
                      className="rounded-md border border-gray-300 bg-transparent px-2 py-1.5 text-sm dark:border-gray-600">
                <option value="">{t("allCities")}</option>
                {Object.entries(cityNames).map(([id, n]) => <option key={id} value={id}>{n}</option>)}
              </select>
            )}
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label={t("when")}
                    className="rounded-md border border-gray-300 bg-transparent px-2 py-1.5 text-sm dark:border-gray-600">
              <option value="newest">{t("sortNewest")}</option>
              <option value="oldest">{t("sortOldest")}</option>
              {tab !== "log" && <option value="name">{t("sortName")}</option>}
              {tab === "reports" && <option value="level">{t("sortLevel")}</option>}
            </select>
            {notice && (
              <p role={notice.ok ? "status" : "alert"} className={`text-sm ${notice.ok ? "text-green-700" : "text-red-600"}`}>{t(notice.key)}</p>
            )}
          </div>

          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
            <table className="w-full min-w-[560px] text-sm">
              {tab === "reports" && (
                <>
                  <thead className="bg-gray-50 dark:bg-gray-900"><tr>
                    <th className={th}>{t("place")}</th><th className={th}>{t("city")}</th><th className={th}>{t("level")}</th>
                    <th className={th}>{t("when")}</th><th className={th}>{t("actions")}</th></tr></thead>
                  <tbody>
                    {shownReports.map((r) => {
                      const minsLeft = EDIT_MINUTES - Math.floor((now - new Date(r.created_at).getTime()) / 60000);
                      return (
                        <tr key={r.id} className="border-t border-gray-100 dark:border-gray-800">
                          <td className={td}>{placeName(r.place)}</td>
                          <td className={td}>{r.place ? cityNames[r.place.city_id] : "—"}</td>
                          <td className={td}>
                            {minsLeft > 0 ? (
                              <select defaultValue={r.level} disabled={busy === r.id} aria-label={t("change")}
                                      onChange={(e) => void run(r.id, () => updateCrowdReport({ reportId: r.id, level: Number(e.target.value) }))}
                                      className="rounded border border-gray-300 bg-transparent px-1 py-0.5 dark:border-gray-600">
                                {[1, 2, 3, 4, 5].map((l) => <option key={l} value={l}>{t(`level.${l}`)}</option>)}
                              </select>
                            ) : (
                              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: levelColor(r.level) }} />{t(`level.${r.level}`)}</span>
                            )}
                          </td>
                          <td className={td}>
                            {fmt(r.created_at)}
                            {minsLeft > 0 && <span className="block text-xs text-gray-500">{t("editableUntil", { min: minsLeft })}</span>}
                          </td>
                          <td className={td}>
                            <HoldButton size="sm" disabled={busy === r.id} aria-label={t("holdDeleteItem", { name: placeName(r.place) })}
                                    holdingLabel={t("keepHolding")} completeLabel={t("deleted")} resetAfter={0}
                                    onHoldComplete={() => void run(r.id, () => deleteCrowdReport(r.id))}>{t("holdDelete")}</HoldButton>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </>
              )}

              {tab === "alerts" && (
                <>
                  <thead className="bg-gray-50 dark:bg-gray-900"><tr>
                    <th className={th}>{t("type")}</th><th className={th}>{t("place")}</th><th className={th}>{t("votes")}</th>
                    <th className={th}>{t("when")}</th><th className={th}>{t("status")}</th><th className={th}>{t("actions")}</th></tr></thead>
                  <tbody>
                    {shownAlerts.map((a) => {
                      const active = new Date(a.expires_at).getTime() > now;
                      return (
                        <tr key={a.id} className="border-t border-gray-100 dark:border-gray-800">
                          <td className={td}><Icon name={quickIcon(a.kind)} size={16} className="inline" /> {tc(`kind.${a.kind}`)}</td>
                          <td className={td}>{placeName(a.place)}</td>
                          <td className={td}><span className="inline-flex items-center gap-1"><Icon name="thumbs_up" size={14} /> {a.still_there}</span> <span className="ml-2 inline-flex items-center gap-1"><Icon name="thumbs_down" size={14} /> {a.gone}</span></td>
                          <td className={td}>{fmt(a.created_at)}</td>
                          <td className={td}>{active ? <span className="text-green-700">{t("active")}</span> : <span className="text-gray-500">{t("ended")}</span>}</td>
                          <td className={td}>
                            <HoldButton size="sm" disabled={busy === a.id} aria-label={t("holdDeleteItem", { name: placeName(a.place) })}
                                    holdingLabel={t("keepHolding")} completeLabel={t("deleted")} resetAfter={0}
                                    onHoldComplete={() => void run(a.id, () => deleteQuickReport(a.id))}>{t("holdDelete")}</HoldButton>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </>
              )}

              {tab === "uploads" && (
                <>
                  <thead className="bg-gray-50 dark:bg-gray-900"><tr>
                    <th className={th}>{t("type")}</th><th className={th}>{t("caption")}</th><th className={th}>{t("place")}</th>
                    <th className={th}>{t("when")}</th><th className={th}>{t("status")}</th><th className={th}>{t("actions")}</th></tr></thead>
                  <tbody>
                    {shownUploads.map((m) => (
                      <tr key={m.id} className="border-t border-gray-100 dark:border-gray-800">
                        <td className={td}><Icon name={MEDIA_ICON[m.kind]} size={16} className="inline" /> {t(`media.${m.kind}`)}</td>
                        <td className={`${td} max-w-xs truncate`} title={m.caption ?? ""}>{m.caption || "—"}</td>
                        <td className={td}>{placeName(m.place)}</td>
                        <td className={td}>{fmt(m.created_at)}</td>
                        <td className={td}>{m.status === "visible" ? <span className="text-green-700">{t("shown")}</span>
                          : m.status === "removed" ? <span className="text-red-600">{t("hiddenByAdmin")}</span>
                          : <span className="text-gray-500">{t("unfinished")}</span>}</td>
                        <td className={td}>
                          <HoldButton size="sm" disabled={busy === m.id} aria-label={t("holdDeleteItem", { name: placeName(m.place) })}
                                    holdingLabel={t("keepHolding")} completeLabel={t("deleted")} resetAfter={0}
                                    onHoldComplete={() => void run(m.id, () => deleteMedia(m.id))}>{t("holdDelete")}</HoldButton>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </>
              )}

              {tab === "comments" && (
                <>
                  <thead className="bg-gray-50 dark:bg-gray-900"><tr>
                    <th className={th}>{t("comment")}</th><th className={th}>{t("place")}</th>
                    <th className={th}>{t("when")}</th><th className={th}>{t("status")}</th><th className={th}>{t("actions")}</th></tr></thead>
                  <tbody>
                    {shownComments.map((c) => (
                      <tr key={c.id} className="border-t border-gray-100 dark:border-gray-800">
                        <td className={`${td} max-w-sm`}><span className="line-clamp-2 break-words">{c.body}</span></td>
                        <td className={td}><Icon name={MEDIA_ICON[c.media_kind]} size={16} className="inline" /> {placeName(c.place)}</td>
                        <td className={td}>{fmt(c.created_at)}</td>
                        <td className={td}>{c.status === "visible" ? <span className="text-green-700">{t("shown")}</span>
                          : <span className="text-red-600">{t("hiddenByAdmin")}</span>}</td>
                        <td className={td}>
                          <HoldButton size="sm" disabled={busy === c.id} aria-label={t("holdDeleteItem", { name: placeName(c.place) })}
                                    holdingLabel={t("keepHolding")} completeLabel={t("deleted")} resetAfter={0}
                                    onHoldComplete={() => void run(c.id, () => deleteComment(c.id))}>{t("holdDelete")}</HoldButton>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </>
              )}

              {tab === "plans" && (
                <>
                  <thead className="bg-gray-50 dark:bg-gray-900"><tr>
                    <th className={th}>{t("place")}</th><th className={th}>{t("city")}</th><th className={th}>{t("when")}</th>
                    <th className={th}>{t("status")}</th><th className={th}>{t("actions")}</th></tr></thead>
                  <tbody>
                    {shownPlans.map((p) => {
                      const upcoming = new Date(p.planned_for).getTime() + 3_600_000 > now;
                      return (
                        <tr key={p.id} className="border-t border-gray-100 dark:border-gray-800">
                          <td className={td}>{placeName(p.place)}</td>
                          <td className={td}>{p.place ? cityNames[p.place.city_id] : "—"}</td>
                          <td className={td}>{fmt(p.planned_for)}</td>
                          <td className={td}>{upcoming ? t("upcoming") : <span className="text-gray-500">{t("past")}</span>}</td>
                          <td className={td}>
                            {upcoming && (
                              <button type="button" className={`${linkBtn} text-red-600`} disabled={busy === p.id}
                                      onClick={() => void run(p.id, () => cancelPlan(p.id), "confirmCancel")}>{t("cancel")}</button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </>
              )}

              {tab === "places" && (
                <>
                  <thead className="bg-gray-50 dark:bg-gray-900"><tr>
                    <th className={th}>{t("place")}</th><th className={th}>{t("city")}</th><th className={th}>{t("status")}</th>
                    <th className={th}>{t("when")}</th><th className={th}>{t("actions")}</th></tr></thead>
                  <tbody>
                    {shownPlaces.map((p) => (
                      <tr key={p.id} className="border-t border-gray-100 dark:border-gray-800">
                        <td className={td}><Icon name={categoryIcon(p.category)} size={16} className="inline" /> {(lang === "hi" && p.name_hi) || p.name}</td>
                        <td className={td}>{cityNames[p.city_id]}</td>
                        <td className={td}>{t(`status.${p.status}`)}</td>
                        <td className={td}>{fmt(p.created_at)}</td>
                        <td className={td}>
                          {p.status === "unconfirmed" && (
                            <HoldButton size="sm" disabled={busy === p.id} aria-label={t("holdDeleteItem", { name: ((lang === "hi" && p.name_hi) || p.name) })}
                                    holdingLabel={t("keepHolding")} completeLabel={t("deleted")} resetAfter={0}
                                    onHoldComplete={() => void run(p.id, () => deleteMyPlace(p.id))}>{t("holdDelete")}</HoldButton>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </>
              )}

              {tab === "log" && (
                <>
                  <thead className="bg-gray-50 dark:bg-gray-900"><tr>
                    <th className={th}>{t("when")}</th><th className={th}>{t("action")}</th><th className={th}>{t("details")}</th></tr></thead>
                  <tbody>
                    {shownLog.map((r) => (
                      <tr key={r.id} className="border-t border-gray-100 dark:border-gray-800">
                        <td className={`${td} whitespace-nowrap`}>{fmt(r.at)}</td>
                        <td className={`${td} font-mono text-xs`}>{r.action}</td>
                        <td className={`${td} max-w-xs truncate font-mono text-xs text-gray-500`} title={JSON.stringify(r.details)}>
                          {Object.keys(r.details ?? {}).length ? JSON.stringify(r.details) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </>
              )}
            </table>
            {(() => {
              const [shown, total] = tab === "reports" ? [shownReports.length, reports.length]
                : tab === "alerts" ? [shownAlerts.length, alerts.length]
                : tab === "uploads" ? [shownUploads.length, uploads.length]
                : tab === "comments" ? [shownComments.length, comments.length]
                : tab === "plans" ? [shownPlans.length, plans.length]
                : tab === "places" ? [shownPlaces.length, places.length]
                : [shownLog.length, log.length];
              return (
                <p className="border-t border-gray-100 px-3 py-2 text-xs text-gray-500 dark:border-gray-800">
                  {total === 0 ? t("empty") : shown === 0 ? t("noMatch") : t("showing", { n: shown, total })}
                </p>
              );
            })()}
          </div>
        </>
      )}
    </div>
  );
}
