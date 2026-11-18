"use client";
import { Icon } from "@/components/icons/Icon";
// The Saved page: notifications inbox, active quiet-time alerts, saved places.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { config, type Language } from "@/lib/config";
import { translator } from "@/lib/i18n";
import { cancelWatch, markAllRead, toggleSaved } from "./actions";
import { messages } from "./messages";
import { notificationText, type NotificationData } from "./text";
import { Reminder } from "./Reminder";

export type NoteRow = { id: number; kind: string; place_id: string | null; data: NotificationData; created_at: string; read_at: string | null };
export type WatchRow = { id: string; expires_at: string; place: { id: string; name: string; name_hi: string | null } | null };
export type SavedRow = { place_id: string; name: string; name_hi: string | null; level: number | null; source: string | null; watch_until: string | null };

const levelColor = (l: number | null) => config.crowd.levels.find((x) => x.level === l)?.color ?? config.crowd.noDataColor;

export function SavedView({ lang, notes, watches, saved }: { lang: Language; notes: NoteRow[]; watches: WatchRow[]; saved: SavedRow[] }) {
  const t = translator(messages, lang);
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const fmt = (iso: string, withDay = true) => new Intl.DateTimeFormat(lang === "hi" ? "hi-IN" : "en-IN", {
    ...(withDay ? { day: "numeric", month: "short" } : {}), hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata",
  }).format(new Date(iso));
  const name = (p: { name: string; name_hi: string | null } | null) => (p ? (lang === "hi" && p.name_hi) || p.name : "—");

  // Opening this page reads the inbox: clear the bell.
  const unread = notes.some((n) => !n.read_at);
  useEffect(() => {
    if (!unread) return;
    void markAllRead().then(() => window.dispatchEvent(new Event("crowdmap:notifications-read")));
  }, [unread]);

  async function run(id: string, fn: () => Promise<unknown>) {
    setBusy(id);
    await fn();
    setBusy(null);
    router.refresh();
  }

  const card = "rounded-lg border border-gray-200 dark:border-gray-800";
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="lg:row-span-2">
        <h2 className="mb-2 flex items-center gap-2 font-medium"><Icon name="bell" size={18} /> {t("inbox")}</h2>
        {notes.length === 0 ? <p className="text-sm text-gray-500">{t("noNotifications")}</p> : (
          <ul className={`${card} divide-y divide-gray-100 dark:divide-gray-800`}>
            {notes.map((n) => {
              const text = notificationText(n.kind, n.data, lang);
              return (
                <li key={n.id} className={`p-3 ${n.read_at ? "" : "bg-blue-50/60 dark:bg-blue-950/30"}`}>
                  <p className="flex items-center gap-2 font-medium">
                    {n.kind === "place_quiet" && <span className="h-2.5 w-2.5 rounded-full" style={{ background: levelColor(n.data.level ?? null) }} />}
                    {text.title}
                    {!n.read_at && <span className="rounded bg-blue-600 px-1.5 text-[10px] font-bold uppercase text-white">{t("new")}</span>}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{text.body}</p>
                  {n.kind === "place_quiet" && <p className="mt-0.5 text-xs font-medium text-green-700 dark:text-green-400">{t("reminderSent")}</p>}
                  <p className="mt-1 flex gap-3 text-xs text-gray-500">
                    {fmt(n.created_at)}
                    {n.place_id && <Link href={`/map?place=${n.place_id}`} className="text-blue-600 hover:underline">{t("open")}</Link>}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section id="reminders" className="scroll-mt-20">
        <h2 className="mb-2 flex items-center gap-2 font-medium"><Icon name="hourglass" size={18} /> {t("watches")}</h2>
        {watches.length === 0 ? <p className="text-sm text-gray-500">{t("noWatches")}</p> : (
          <ul className={`${card} divide-y divide-gray-100 dark:divide-gray-800`}>
            {watches.map((w) => (
              <li key={w.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <span>
                  {w.place ? <Link href={`/map?place=${w.place.id}`} className="font-medium hover:underline">{name(w.place)}</Link> : "—"}
                  <span className="block text-xs text-gray-500">{t("until", { time: fmt(w.expires_at) })}</span>
                </span>
                <button type="button" disabled={busy === w.id} onClick={() => run(w.id, () => cancelWatch(w.id))}
                        className="text-red-600 hover:underline disabled:opacity-50">{t("cancelWatch")}</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 flex items-center gap-2 font-medium"><Icon name="star" size={18} /> {t("savedPlaces")}</h2>
        {saved.length === 0 ? <p className="text-sm text-gray-500">{t("noSaved")}</p> : (
          <ul className={`${card} divide-y divide-gray-100 dark:divide-gray-800`}>
            {saved.map((s) => (
              <li key={s.place_id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: levelColor(s.level), opacity: s.source === "live" ? 1 : 0.6 }} />
                  <span className="min-w-0">
                    <Link href={`/map?place=${s.place_id}`} className="font-medium hover:underline">{name(s)}</Link>
                    <span className="block text-xs text-gray-500">
                      {s.level ? `${t(`level.${s.level}`)} · ${s.source === "live" ? t("live") : t("estimated")}` : "—"}
                      {s.watch_until && ` · ${t("alertUntil", { time: fmt(s.watch_until, false) })}`}
                    </span>
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1.5">
                  <Reminder placeId={s.place_id} placeName={name(s)} lang={lang} compact />
                  <button type="button" disabled={busy === s.place_id} onClick={() => run(s.place_id, () => toggleSaved(s.place_id))}
                          className="text-xs text-red-600 hover:underline disabled:opacity-50">{t("remove")}</button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
