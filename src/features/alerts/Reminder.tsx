"use client";
// "Remind me when quieter": a reminder that this place's crowd level drops to the
// chosen level. Runs on the server, so it works with the site closed (push).
// Text only. When a reminder is active the button reads "Reminder on"; pressing
// it again turns the reminder off.
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Language } from "@/lib/config";
import { translator } from "@/lib/i18n";
import { cancelWatch, watchPlace } from "./actions";
import { messages } from "./messages";
import { enablePush } from "./push";
import { WATCH_HOURS } from "./validation";

type State = { signed_in: boolean; watch: { id: string; expires_at: string; target_level: number } | null };

export function Reminder({ placeId, placeName, lang, compact = false, tone = "light" }: {
  placeId: string; placeName: string; lang: Language;
  /** Smaller button for lists and cards. */
  compact?: boolean;
  /** Colours for light panels or dark cards. */
  tone?: "light" | "dark";
}) {
  const t = translator(messages, lang);
  const [state, setState] = useState<State | null>(null);
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState(2);
  const [hours, setHours] = useState(6);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; key: string } | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/me/place/${placeId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d) setState(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [placeId, version]);

  const dark = tone === "dark";
  const size = compact ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm";
  const base = `inline-flex items-center rounded-full border font-medium disabled:opacity-50 ${size}`;
  const offCls = dark ? "border-zinc-600 text-zinc-100 hover:border-zinc-400" : "border-gray-300 text-gray-800 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-100 dark:hover:bg-gray-800";
  const onCls = dark ? "border-blue-400 bg-blue-500/15 text-blue-200" : "border-blue-500 bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-200";
  const panel = dark ? "bg-zinc-900 text-zinc-100 ring-zinc-700" : "bg-white text-gray-900 ring-gray-200 dark:bg-gray-900 dark:text-gray-100 dark:ring-gray-700";

  if (!state) return null;
  if (!state.signed_in) {
    return <Link href="/login?next=/map" data-no-flip className={`${base} ${offCls}`}>{t("remind")}</Link>;
  }

  async function save() {
    setBusy(true);
    setNote(null);
    const r = await watchPlace({ placeId, hours, target });
    if (!r.ok) {
      setBusy(false);
      setNote({ ok: r.reason === "already_quiet", key: `result.${r.reason ?? "error"}` });
      return;
    }
    // Only now ask for notification permission, and only if this device isn't set up yet.
    const push = await enablePush();
    setBusy(false);
    setOpen(false);
    setNote(push === "denied" ? { ok: false, key: "blocked" }
      : push === "on" ? { ok: true, key: "reminderSaved" }
      : { ok: true, key: "reminderSavedInbox" });
    setVersion((v) => v + 1);
  }

  async function turnOff() {
    if (!state?.watch) return;
    setBusy(true);
    await cancelWatch(state.watch.id);
    setBusy(false);
    setNote(null);
    setVersion((v) => v + 1);
  }

  return (
    <div className="space-y-2" data-no-flip>
      {state.watch ? (
        <button type="button" disabled={busy} aria-pressed onClick={turnOff} className={`${base} ${onCls}`}>{t("reminderOn")}</button>
      ) : (
        <button type="button" disabled={busy} aria-expanded={open} onClick={() => { setOpen((o) => !o); setNote(null); }} className={`${base} ${offCls}`}>
          {t("remind")}
        </button>
      )}
      {open && !state.watch && (
        <div role="dialog" aria-label={t("remind")} className={`space-y-3 rounded-xl p-3 text-sm ring-1 ${panel}`}>
          <p className="font-medium">{placeName}</p>
          <fieldset>
            <legend className="mb-1.5 text-xs opacity-70">{t("tellMeWhen")}</legend>
            {[{ v: 2, k: "level.quietOrBetter" }, { v: 3, k: "level.moderateOrBetter" }, { v: 1, k: "level.emptyOnly" }].map((o) => (
              <label key={o.v} className="flex cursor-pointer items-center gap-2 py-0.5">
                <input type="radio" name={`target-${placeId}`} checked={target === o.v} onChange={() => setTarget(o.v)} className="accent-blue-600" />
                {t(o.k)}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend className="mb-1.5 text-xs opacity-70">{t("notifyFor")}</legend>
            <div className="flex flex-wrap gap-1.5">
              {WATCH_HOURS.map((h) => (
                <button key={h} type="button" aria-pressed={hours === h} onClick={() => setHours(h)}
                        className={`rounded-md px-2 py-1 text-xs ${hours === h ? "bg-blue-600 text-white" : dark ? "bg-zinc-800" : "bg-gray-100 dark:bg-gray-800"}`}>
                  {t("hours", { n: h })}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={save} className="rounded-md bg-blue-600 px-3 py-1.5 font-medium text-white disabled:opacity-50">{t("saveReminder")}</button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-md px-3 py-1.5 opacity-80 hover:opacity-100">{t("cancel")}</button>
          </div>
        </div>
      )}
      {note && (
        <p role={note.ok ? "status" : "alert"} className={`text-xs ${note.ok ? (dark ? "text-green-300" : "text-green-700 dark:text-green-400") : "text-amber-600"}`}>
          {t(note.key)}{note.key === "blocked" && <> <Link href="/saved" className="underline">{t("title")}</Link></>}
        </p>
      )}
    </div>
  );
}
