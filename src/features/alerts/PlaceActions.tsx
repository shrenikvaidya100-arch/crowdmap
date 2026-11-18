"use client";
import { Icon } from "@/components/icons/Icon";
// ☆ Save and 🔔 "Notify me when it's quiet" in the place panel.
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Language } from "@/lib/config";
import { translator } from "@/lib/i18n";
import { cancelWatch, toggleSaved, watchPlace } from "./actions";
import { messages } from "./messages";
import { WATCH_HOURS } from "./validation";

type State = { signed_in: boolean; saved: boolean; watch: { id: string; expires_at: string } | null; push_devices: number };

export function PlaceActions({ placeId, lang }: { placeId: string; lang: Language }) {
  const t = translator(messages, lang);
  const [state, setState] = useState<State | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; key: string } | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/me/place/${placeId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d) setState(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [placeId, version]);

  const time = (iso: string) => new Intl.DateTimeFormat(lang === "hi" ? "hi-IN" : "en-IN", {
    hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata",
  }).format(new Date(iso));

  async function act(fn: () => Promise<{ ok: boolean; reason?: string }>, okKey?: string) {
    setBusy(true);
    setNotice(null);
    const r = await fn();
    setBusy(false);
    if (r.ok) { if (okKey) setNotice({ ok: true, key: okKey }); setVersion((v) => v + 1); }
    else setNotice({ ok: r.reason === "already_quiet", key: `result.${r.reason ?? "error"}` });
  }

  if (!state) return null;
  if (!state.signed_in) {
    return <Link href="/login?next=/" className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline"><Icon name="star" size={16} /> {t("signInFirst")}</Link>;
  }

  const btn = "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium disabled:opacity-50";
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} aria-pressed={state.saved} onClick={() => act(() => toggleSaved(placeId))}
                className={`${btn} ${state.saved ? "border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200" : "border-gray-300 dark:border-gray-700"}`}>
          <Icon name={state.saved ? "star_filled" : "star"} size={16} /> {state.saved ? t("saved") : t("save")}
        </button>
        {state.watch ? (
          <span className={`${btn} border-blue-300 bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-200`}>
            <Icon name="bell" size={16} /> {t("watching", { time: time(state.watch.expires_at) })}
            <button type="button" disabled={busy} onClick={() => act(() => cancelWatch(state.watch!.id))}
                    className="ml-1 text-xs underline">{t("cancelWatch")}</button>
          </span>
        ) : (
          <button type="button" disabled={busy} aria-expanded={choosing} onClick={() => setChoosing((c) => !c)}
                  className={`${btn} border-gray-300 dark:border-gray-700`}>
            <Icon name="bell" size={16} /> {t("notify")}
          </button>
        )}
      </div>
      {choosing && !state.watch && (
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="text-gray-600 dark:text-gray-400">{t("notifyFor")}</span>
          {WATCH_HOURS.map((h) => (
            <button key={h} type="button" disabled={busy}
                    onClick={() => { setChoosing(false); void act(() => watchPlace({ placeId, hours: h }), "result.watching"); }}
                    className="rounded-md border border-blue-300 px-2 py-1 text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-950">
              {t("hours", { n: h })}
            </button>
          ))}
        </div>
      )}
      {notice && (
        <p role={notice.ok ? "status" : "alert"} className={`text-sm ${notice.ok ? "text-green-700 dark:text-green-400" : "text-amber-700"}`}>
          {t(notice.key)}
          {notice.key === "result.watching" && state.push_devices === 0 && (
            <> {t("pushHint")} <Link href="/saved" className="underline">{t("title")}</Link></>
          )}
        </p>
      )}
    </section>
  );
}
