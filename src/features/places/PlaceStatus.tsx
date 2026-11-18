"use client";
// For a user-added place that isn't confirmed yet: others at the spot confirm
// or deny it; the person who added it can edit or delete it.
import { useState } from "react";
import type { Language } from "@/lib/config";
import { translator } from "@/lib/i18n";
import { getGpsFix, GpsError } from "@/features/crowd/gps";
import { confirmPlace, deleteMyPlace, editMyPlace, type PlaceResult } from "./actions";
import { messages } from "./messages";
import { PlaceForm, type PlaceFields } from "./PlaceForm";

export type PlaceStatusInfo = {
  id: string; name: string; name_hi: string | null; category: string;
  status: "listed" | "unconfirmed"; added_by_me: boolean;
};
export type Confirmations = { yes: number; no: number; mine: boolean | null };

export function PlaceStatus({
  lang, place, confirmations, signedIn, onChanged, onDeleted,
}: {
  lang: Language;
  place: PlaceStatusInfo;
  confirmations: Confirmations;
  signedIn: boolean;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const t = translator(messages, lang);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; key: string } | null>(null);

  if (place.status !== "unconfirmed") return null;

  async function run(fn: () => Promise<PlaceResult>, okKey: (r: PlaceResult) => string, after?: (r: PlaceResult) => void) {
    setBusy(true);
    setNotice(null);
    try {
      const r = await fn();
      setNotice({ ok: r.ok, key: r.ok ? okKey(r) : `result.${r.reason}` });
      if (r.ok) after?.(r);
    } catch (err) {
      setNotice({ ok: false, key: err instanceof GpsError ? `gps.${err.code}` : "result.error" });
    } finally {
      setBusy(false);
    }
  }

  const vote = (exists: boolean) => run(
    async () => confirmPlace({ placeId: place.id, exists, fix: await getGpsFix() }),
    (r) => `result.${r.status ?? "unconfirmed"}`,
    (r) => (r.status === "removed" ? onDeleted() : onChanged()),
  );

  const save = (v: PlaceFields) => run(
    () => editMyPlace({ placeId: place.id, ...v }),
    () => "result.saved",
    () => { setEditing(false); onChanged(); },
  );

  return (
    <section className="rounded-lg border-2 border-dashed border-violet-400 p-3 text-sm">
      <p className="font-medium text-violet-700 dark:text-violet-300">{t("unconfirmed", { yes: confirmations.yes })}</p>

      {place.added_by_me ? (
        editing ? (
          <div className="mt-2">
            <PlaceForm lang={lang} busy={busy} submitLabel={t("save")} onSubmit={(v) => void save(v)} onCancel={() => setEditing(false)}
                       initial={{ name: place.name, nameHi: place.name_hi ?? "", category: place.category }} />
          </div>
        ) : (
          <>
            <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">{t("addedByYou")}</p>
            <div className="mt-2 flex gap-3">
              <button type="button" className="text-blue-600 hover:underline" onClick={() => setEditing(true)}>{t("edit")}</button>
              <button type="button" className="text-red-600 hover:underline" disabled={busy}
                      onClick={() => { if (confirm(t("confirmDelete"))) void run(() => deleteMyPlace(place.id), () => "result.deleted", onDeleted); }}>
                {t("delete")}
              </button>
            </div>
          </>
        )
      ) : (
        <>
          <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">{t("unconfirmedHint")}</p>
          {confirmations.mine !== null && (
            <p className="mt-1 text-xs">{t(confirmations.mine ? "youConfirmed" : "youDenied")}</p>
          )}
          {signedIn ? (
            <div className="mt-2 flex gap-2">
              <button type="button" disabled={busy} onClick={() => void vote(true)}
                      className="flex-1 rounded-md bg-violet-600 px-3 py-1.5 text-white hover:bg-violet-700 disabled:opacity-50">{t("itsHere")}</button>
              <button type="button" disabled={busy} onClick={() => void vote(false)}
                      className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:hover:bg-gray-800">{t("notHere")}</button>
            </div>
          ) : (
            <a href="/login?next=/map" className="mt-2 inline-block text-blue-600 underline">{t("result.signin")}</a>
          )}
        </>
      )}

      {notice && (
        <p role={notice.ok ? "status" : "alert"}
           className={`mt-2 rounded-md px-2.5 py-1.5 text-xs ${notice.ok ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200" : "bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200"}`}>
          {t(notice.key)}
        </p>
      )}
    </section>
  );
}
