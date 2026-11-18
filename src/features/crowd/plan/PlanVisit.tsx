"use client";
import { Icon } from "@/components/icons/Icon";
// "Plan your visit": pick a day and hour, see the expected crowd (with weather,
// holidays and how many people plan to go), the best time, and add your plan.
import Link from "next/link";
import { useEffect, useState } from "react";
import { config, type Language } from "@/lib/config";
import { translator } from "@/lib/i18n";
import { cancelPlan, planVisit, type PlanResult } from "./actions";
import type { Forecast } from "./forecast";
import { messages } from "./messages";
import { weatherIcon } from "./weather";

const DAYS = 7;
const levelColor = (l: number) => config.crowd.levels.find((x) => x.level === l)?.color ?? config.crowd.noDataColor;
const OUTDOOR = new Set(["park", "tourist", "market", "street_food", "temple"]);
const INDOOR = new Set(["mall", "cafe", "restaurant", "entertainment"]);

function indiaDate(offset: number) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(Date.now() + offset * 86_400_000));
}
function hourLabel(h: number, lang: Language) {
  const d = new Date(Date.UTC(2026, 0, 1, h));
  return new Intl.DateTimeFormat(lang === "hi" ? "hi-IN" : "en-IN", { hour: "numeric", hour12: true, timeZone: "UTC" }).format(d);
}

export function PlanVisit({ placeId, category, lang }: { placeId: string; category: string; lang: Language }) {
  const t = translator(messages, lang);
  // Day list and "now" are fixed when the panel opens, so renders stay stable.
  const [days] = useState(() => Array.from({ length: DAYS }, (_, i) => indiaDate(i)));
  const [hourNow] = useState(() => Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Kolkata" }).format(new Date())));
  const [day, setDay] = useState(0);
  const [fc, setFc] = useState<Forecast | null>(null);
  const [failed, setFailed] = useState(false);
  const [hour, setHour] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; key: string } | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/places/${placeId}/forecast?date=${days[day]}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: Forecast) => {
        if (cancelled) return;
        setFc(d);
        setFailed(false);
        setHour((h) => h ?? d.best?.hour ?? null);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [placeId, day, days, reload]);

  function chooseDay(i: number) {
    setDay(i);
    setFc(null);
    setHour(null);
    setNotice(null);
  }

  async function act(run: () => Promise<PlanResult>, okKey: string) {
    setBusy(true);
    setNotice(null);
    const res = await run();
    setBusy(false);
    setNotice({ ok: res.ok, key: res.ok ? okKey : `result.${res.reason}` });
    if (res.ok) setReload((n) => n + 1);
  }

  const dayName = (i: number) => i === 0 ? t("today") : i === 1 ? t("tomorrow")
    : new Intl.DateTimeFormat(lang === "hi" ? "hi-IN" : "en-IN", { weekday: "short", day: "numeric", timeZone: "Asia/Kolkata" })
        .format(new Date(`${days[i]}T12:00:00+05:30`));

  const sel = fc && hour !== null ? fc.hours[hour] : null;
  const selLevel = sel ? Math.round(sel.level) : null;
  const isPast = day === 0 && hour !== null && hour < hourNow;
  const myPlan = sel ? fc?.myPlans.find((p) => new Date(p.planned_for).getTime() === new Date(sel.at).getTime()) : undefined;

  return (
    <section>
      <h3 className="mb-2 text-sm font-medium">{t("title")}</h3>

      <div className="mb-3 flex gap-1.5 overflow-x-auto [scrollbar-width:none]" role="tablist">
        {days.map((d, i) => (
          <button key={d} type="button" role="tab" aria-selected={day === i} onClick={() => chooseDay(i)}
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${day === i ? "bg-blue-600 text-white" : "bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"}`}>
            {dayName(i)}
          </button>
        ))}
      </div>

      {failed && <p className="text-sm text-red-600">{t("error")}</p>}
      {!fc && !failed && <p className="h-24 text-sm text-gray-500">{t("loading")}</p>}

      {fc && (
        <>
          {fc.special.map((s) => (
            <p key={s.name} className="mb-2 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
              <Icon name="procession" size={14} className="inline" /> {t(s.boost >= 0 ? "special" : "specialQuieter", { name: lang === "hi" && s.name_hi ? s.name_hi : s.name })}
            </p>
          ))}

          {/* Hourly bars: tap to choose an hour */}
          <div className="flex h-20 items-end gap-[2px]">
            {fc.hours.map((h) => {
              const lvl = Math.round(h.level);
              const past = day === 0 && h.hour < hourNow;
              return (
                <button key={h.hour} type="button" onClick={() => setHour(h.hour)}
                        aria-label={`${hourLabel(h.hour, lang)}: ${t(`level.${lvl}`)}`} aria-pressed={hour === h.hour}
                        className="group flex h-full flex-1 flex-col justify-end">
                  <span className="block w-full rounded-t-sm transition-opacity"
                        style={{ height: `${h.level * 20}%`, background: levelColor(lvl),
                                 opacity: hour === h.hour ? 1 : past ? 0.25 : 0.6,
                                 outline: hour === h.hour ? "2px solid currentColor" : undefined }} />
                </button>
              );
            })}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-gray-500">
            {[0, 6, 12, 18, 23].map((h) => <span key={h}>{hourLabel(h, lang)}</span>)}
          </div>

          <p className="mt-2 text-xs">
            {fc.best ? (
              <button type="button" className="text-blue-600 hover:underline" onClick={() => setHour(fc.best!.hour)}>
                <Icon name="star" size={14} className="inline" /> {t("best", { time: hourLabel(fc.best.hour, lang), level: t(`level.${fc.best.level}`) })}
              </button>
            ) : <span className="text-gray-500">{t("bestNone")}</span>}
          </p>

          {sel && selLevel !== null ? (
            <div className="mt-3 space-y-1 rounded-lg border border-gray-200 p-3 text-sm dark:border-gray-700">
              <p className="flex items-center gap-2 font-medium">
                <span className="h-3 w-3 rounded-full" style={{ background: levelColor(selLevel) }} />
                {hourLabel(sel.hour, lang)} · {t("expected", { level: t(`level.${selLevel}`) })}
                {sel.weather && (
                  <span className="ml-auto text-xs font-normal text-gray-500">
                    {(() => { const w = weatherIcon(sel.weather.code); return w ? <Icon name={w} size={16} className="inline" /> : null; })()} {sel.weather.temp !== null ? `${Math.round(sel.weather.temp)}°C` : ""}
                  </span>
                )}
              </p>
              {sel.plans > 0 && <p className="flex items-center gap-1 text-xs"><Icon name="users" size={14} /> {sel.plans === 1 ? t("plansOne") : t("plans", { n: sel.plans })}</p>}
              {sel.weatherReason === "rain" && (
                <p className="flex items-center gap-1 text-xs"><Icon name="rain" size={14} /> {t("rain", { effect: t(OUTDOOR.has(category) ? "rain.outdoor" : INDOOR.has(category) ? "rain.indoor" : "rain.other") })}</p>
              )}
              {sel.weatherReason === "heat" && <p className="flex items-center gap-1 text-xs"><Icon name="thermometer" size={14} /> {t("heat")}</p>}
              <p className="text-xs text-gray-500">{sel.historyReports > 0 ? t("history", { n: sel.historyReports }) : t("typical")}</p>

              <div className="pt-2">
                {isPast ? (
                  <p className="text-xs text-gray-500">{t("past")}</p>
                ) : !fc.signedIn ? (
                  <Link href="/login?next=/" className="inline-block rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white">{t("signIn")}</Link>
                ) : myPlan ? (
                  <p className="flex items-center gap-3 text-sm">
                    <Icon name="check" size={14} className="inline" /> {t("planned", { time: hourLabel(sel.hour, lang) })}
                    <button type="button" disabled={busy} className="text-red-600 hover:underline"
                            onClick={() => void act(() => cancelPlan(myPlan.id), "result.cancelled")}>{t("cancel")}</button>
                  </p>
                ) : (
                  <button type="button" disabled={busy}
                          onClick={() => void act(() => planVisit({ placeId, at: sel.at }), "result.ok")}
                          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                    {t("planAt", { time: hourLabel(sel.hour, lang) })}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <p className="mt-2 text-xs text-gray-500">{t("pick")}</p>
          )}

          {notice && (
            <p role={notice.ok ? "status" : "alert"}
               className={`mt-2 rounded-md px-3 py-2 text-xs ${notice.ok ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200" : "bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200"}`}>
              {t(notice.key)}
            </p>
          )}
        </>
      )}
    </section>
  );
}
