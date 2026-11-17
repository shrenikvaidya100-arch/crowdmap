"use client";
// Panel for one place: crowd now, plan your visit, reporting, alerts.
// Bottom sheet on phones, side panel on larger screens.
import Link from "next/link";
import { PlanVisit } from "./plan/PlanVisit";
import { useCallback, useEffect, useState } from "react";
import { config, type Language } from "@/lib/config";
import { translator } from "@/lib/i18n";
import {
  deleteCrowdReport, deleteQuickReport, submitCrowdReport, submitQuickReport,
  updateCrowdReport, voteQuickReport, type ActionResult,
} from "./actions";
import { CATEGORY_ICON, QUICK_KINDS, quickIcon } from "./config";
import { getGpsFix, GpsError } from "./gps";
import { messages } from "./messages";

type Details = {
  place: { id: string; name: string; name_hi: string | null; category: string; address: string | null; lat: number; lng: number };
  crowd: { level: number; source: "live" | "estimated"; reports: number; last_report_at: string | null; today: number[] };
  alerts: { id: string; kind: string; still_there: number; gone: number; created_at: string; mine: boolean }[];
  my_report: { id: string; level: number; created_at: string; editable: boolean } | null;
  signed_in: boolean;
};

const levelColor = (l: number) => config.crowd.levels.find((x) => x.level === l)?.color ?? config.crowd.noDataColor;

export function PlaceSheet({
  placeId, lang, onClose, onChanged,
}: {
  placeId: string;
  lang: Language;
  onClose: () => void;
  onChanged: () => void;
}) {
  const t = translator(messages, lang);
  const [data, setData] = useState<Details | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState<"gps" | "sending" | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; key: string } | null>(null);
  const [editing, setEditing] = useState(false);
  // "Now" is captured when data arrives, so times stay stable between renders.
  const [now, setNow] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/places/${placeId}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setData(await res.json());
      setNow(Date.now());
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, [placeId]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/places/${placeId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => { if (!cancelled) { setData(d); setNow(Date.now()); setLoadError(false); } })
      .catch(() => { if (!cancelled) setLoadError(true); });
    return () => { cancelled = true; };
  }, [placeId]);

  function ago(iso: string) {
    const min = Math.round(((now ?? 0) - new Date(iso).getTime()) / 60000);
    if (min < 1) return t("ago.now");
    if (min < 60) return t("ago.min", { n: min });
    return t("ago.hour", { n: Math.round(min / 60) });
  }

  /** Runs an action that needs GPS, then refreshes the panel and the map. */
  async function withGps(run: (fix: Awaited<ReturnType<typeof getGpsFix>>) => Promise<ActionResult>, okKey = "result.ok") {
    setNotice(null);
    setBusy("gps");
    try {
      const fix = await getGpsFix();
      setBusy("sending");
      const res = await run(fix);
      setNotice({ ok: res.ok, key: res.ok ? okKey : `result.${res.reason}` });
      if (res.ok) { await load(); onChanged(); }
    } catch (err) {
      setNotice({ ok: false, key: err instanceof GpsError ? `gps.${err.code}` : "result.error" });
    } finally {
      setBusy(null);
    }
  }

  async function simple(run: () => Promise<ActionResult>, okKey: string) {
    setNotice(null);
    setBusy("sending");
    const res = await run();
    setBusy(null);
    setEditing(false);
    setNotice({ ok: res.ok, key: res.ok ? okKey : `result.${res.reason}` });
    if (res.ok) { await load(); onChanged(); }
  }

  const name = data ? (lang === "hi" && data.place.name_hi) || data.place.name : "";

  return (
    <aside
      aria-label={name || t("loading")}
      className="absolute inset-x-0 bottom-0 z-30 max-h-[70%] overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:inset-y-3 sm:left-auto sm:right-3 sm:max-h-none sm:w-96 sm:rounded-2xl dark:bg-gray-900"
    >
      <div className="sticky top-0 flex items-start gap-3 border-b border-gray-100 bg-white/95 px-4 py-3 backdrop-blur dark:border-gray-800 dark:bg-gray-900/95">
        <span aria-hidden className="text-2xl">{data ? CATEGORY_ICON[data.place.category] ?? "📍" : "📍"}</span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold">{name || t("loading")}</h2>
          {data?.place.address && <p className="truncate text-xs text-gray-500">{data.place.address}</p>}
        </div>
        <button type="button" onClick={onClose} className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">
          <span aria-hidden>✕</span><span className="sr-only">{t("close")}</span>
        </button>
      </div>

      {loadError && <p className="p-4 text-sm text-red-600">{t("result.error")}</p>}

      {data && (
        <div className="space-y-5 px-4 py-4">
          {/* Crowd now */}
          <section className="flex items-center gap-3">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full text-sm font-bold text-white"
                  style={{ background: levelColor(data.crowd.level), opacity: data.crowd.source === "live" ? 1 : 0.7 }}>
              {data.crowd.level}/5
            </span>
            <div className="min-w-0">
              <p className="text-lg font-semibold">
                {t(`level.${data.crowd.level}`)}
                <span className={`ml-2 rounded px-1.5 py-0.5 align-middle text-[11px] font-medium uppercase tracking-wide ${data.crowd.source === "live" ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"}`}>
                  {data.crowd.source === "live" ? `● ${t("live")}` : t("estimated")}
                </span>
              </p>
              <p className="text-xs text-gray-500">
                {data.crowd.source === "live"
                  ? `${t("liveHint", { n: data.crowd.reports })}${data.crowd.last_report_at ? ` · ${t("updated", { ago: ago(data.crowd.last_report_at) })}` : ""}`
                  : t("estimatedHint")}
              </p>
            </div>
          </section>

          {/* Forecast by day and hour, best time, plans */}
          <PlanVisit placeId={placeId} category={data.place.category} lang={lang} />

          {notice && (
            <p role={notice.ok ? "status" : "alert"}
               className={`rounded-md px-3 py-2 text-sm ${notice.ok ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200" : "bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200"}`}>
              {t(notice.key)}
            </p>
          )}
          {busy && <p className="text-sm text-blue-600" aria-live="polite">{t(busy === "gps" ? "gettingGps" : "sending")}</p>}

          {/* Report crowd */}
          <section>
            <h3 className="text-sm font-medium">{t("howCrowded")}</h3>
            {!data.signed_in ? (
              <Link href={`/login?next=/`} className="mt-2 inline-block rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white">
                {t("signInToReport")}
              </Link>
            ) : (
              <>
                <p className="mb-2 text-xs text-gray-500">{t("mustBeHere")}</p>
                {data.my_report && !editing && (
                  <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md bg-gray-50 px-3 py-2 text-sm dark:bg-gray-800">
                    <span className="flex-1">{t("yourReport", { level: t(`level.${data.my_report.level}`), ago: ago(data.my_report.created_at) })}</span>
                    {data.my_report.editable && (
                      <button type="button" className="text-blue-600 hover:underline" onClick={() => setEditing(true)}>{t("change")}</button>
                    )}
                    <button type="button" className="text-red-600 hover:underline" disabled={!!busy}
                            onClick={() => { if (confirm(t("confirmDelete"))) void simple(() => deleteCrowdReport(data.my_report!.id), "result.deleted"); }}>
                      {t("delete")}
                    </button>
                  </div>
                )}
                <div className="grid grid-cols-5 gap-1.5">
                  {config.crowd.levels.map((l) => (
                    <button key={l.level} type="button" disabled={!!busy}
                            onClick={() => editing && data.my_report
                              ? void simple(() => updateCrowdReport({ reportId: data.my_report!.id, level: l.level }), "result.updated")
                              : void withGps((fix) => submitCrowdReport({ placeId, level: l.level, fix }))}
                            className="flex flex-col items-center gap-1 rounded-lg border border-gray-200 px-1 py-2 text-[11px] font-medium hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800">
                      <span className="h-4 w-4 rounded-full" style={{ background: l.color }} />
                      {t(`level.${l.level}`)}
                    </button>
                  ))}
                </div>
              </>
            )}
          </section>

          {/* Active alerts */}
          {data.alerts.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-medium">{t("activeAlerts")}</h3>
              <ul className="space-y-2">
                {data.alerts.map((a) => (
                  <li key={a.id} className="flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm dark:border-gray-700">
                    <span aria-hidden>{quickIcon(a.kind)}</span>
                    <span className="flex-1">
                      {t(`kind.${a.kind}`)} <span className="text-xs text-gray-500">· {ago(a.created_at)} · {t("votes", { yes: a.still_there, no: a.gone })}</span>
                    </span>
                    {data.signed_in && (a.mine ? (
                      <button type="button" className="text-xs text-red-600 hover:underline" disabled={!!busy}
                              onClick={() => void simple(() => deleteQuickReport(a.id), "result.deleted")}>{t("delete")}</button>
                    ) : (
                      <>
                        <button type="button" className="text-xs text-green-700 hover:underline" disabled={!!busy}
                                onClick={() => void withGps((fix) => voteQuickReport({ reportId: a.id, stillThere: true, fix }))}>{t("stillThere")}</button>
                        <button type="button" className="text-xs text-gray-600 hover:underline" disabled={!!busy}
                                onClick={() => void withGps((fix) => voteQuickReport({ reportId: a.id, stillThere: false, fix }))}>{t("gone")}</button>
                      </>
                    ))}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Quick reports */}
          {data.signed_in && (
            <section>
              <h3 className="mb-2 text-sm font-medium">{t("quickTitle")}</h3>
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                {QUICK_KINDS.map((k) => (
                  <button key={k.kind} type="button" disabled={!!busy}
                          onClick={() => void withGps((fix) => submitQuickReport({ kind: k.kind, placeId, fix }))}
                          className="flex flex-col items-center gap-0.5 rounded-lg border border-gray-200 px-1 py-2 text-[11px] leading-tight hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800">
                    <span aria-hidden className="text-lg">{k.icon}</span>{t(`kind.${k.kind}`)}
                  </button>
                ))}
              </div>
            </section>
          )}

          <a href={`https://www.google.com/maps/dir/?api=1&destination=${data.place.lat},${data.place.lng}`}
             target="_blank" rel="noopener noreferrer"
             className="block rounded-md border border-gray-300 px-3 py-2 text-center text-sm font-medium hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-800">
            {t("openInMaps")} ↗
          </a>
        </div>
      )}
    </aside>
  );
}
