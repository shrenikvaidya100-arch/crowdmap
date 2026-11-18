"use client";
import { Icon } from "@/components/icons/Icon";
// "Add a missing place": get a GPS fix at the spot, then name and category.
import { useState } from "react";
import type { Language } from "@/lib/config";
import { translator } from "@/lib/i18n";
import { getGpsFix, GpsError } from "@/features/crowd/gps";
import type { GpsFix } from "@/features/crowd/validation";
import { addPlace } from "./actions";
import { messages } from "./messages";
import { PlaceForm, type PlaceFields } from "./PlaceForm";

export function AddPlaceSheet({
  lang, onClose, onLocated, onAdded, onOpenPlace,
}: {
  lang: Language;
  onClose: () => void;
  onLocated: (fix: GpsFix) => void;
  onAdded: (p: { id: string; cityId: string; lat: number; lng: number }) => void;
  onOpenPlace: (id: string) => void;
}) {
  const t = translator(messages, lang);
  const [fix, setFix] = useState<GpsFix | null>(null);
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<"idle" | "success" | "error">("idle");
  const [notice, setNotice] = useState<{ ok: boolean; key: string; signIn?: boolean } | null>(null);
  const [duplicate, setDuplicate] = useState<{ id: string; name: string } | null>(null);

  async function locate() {
    setLocating(true);
    setNotice(null);
    try {
      const f = await getGpsFix();
      setFix(f);
      onLocated(f);
    } catch (err) {
      setNotice({ ok: false, key: err instanceof GpsError ? `gps.${err.code}` : "result.error" });
    } finally {
      setLocating(false);
    }
  }

  async function submit(v: PlaceFields) {
    if (!fix || busy || saved === "success") return;
    setBusy(true);
    setNotice(null);
    setDuplicate(null);
    const res = await addPlace({ ...v, fix });
    setBusy(false);
    if (res.ok && res.id && res.cityId) {
      // Let the check and the burst play, then show the new place.
      setSaved("success");
      const added = { id: res.id, cityId: res.cityId, lat: fix.lat, lng: fix.lng };
      setTimeout(() => onAdded(added), 900);
      return;
    }
    setSaved("error");
    if (res.duplicate) setDuplicate(res.duplicate);
    setNotice({ ok: false, key: `result.${res.reason}`, signIn: res.reason === "signin" });
  }

  return (
    <section aria-label={t("addTitle")}
             className="absolute inset-x-0 bottom-0 z-40 max-h-[85%] overflow-y-auto rounded-t-2xl bg-white p-4 shadow-2xl sm:inset-x-auto sm:bottom-auto sm:right-3 sm:top-3 sm:w-96 sm:rounded-2xl dark:bg-gray-900">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("addTitle")}</h2>
        <button type="button" aria-label={t("cancel")} onClick={onClose}
                className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"><Icon name="close" /></button>
      </div>
      <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">{t("intro")}</p>

      {!fix ? (
        <button type="button" onClick={() => void locate()} disabled={locating}
                className="w-full rounded-md bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          <Icon name="locate" size={16} className="inline" /> {locating ? t("gettingLocation") : t("getLocation")}
        </button>
      ) : (
        <>
          <p className="mb-3 rounded-md bg-green-50 px-3 py-2 text-xs text-green-800 dark:bg-green-950 dark:text-green-200">
            <Icon name="pin" size={16} className="inline" /> {t("locationOk", { acc: fix.accuracy })}
          </p>
          <PlaceForm lang={lang} submitLabel={t("submit")} successLabel={t("addedShort")} status={saved} busy={busy} onSubmit={(v) => void submit(v)} onCancel={onClose} />
          <p className="mt-3 text-xs text-gray-500">
            <a className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer"
               href={`https://www.openstreetmap.org/edit#map=19/${fix.lat.toFixed(6)}/${fix.lng.toFixed(6)}`}>{t("osm")}</a>
            {" "}{t("osmHint")}
          </p>
        </>
      )}

      {notice && (
        <div role="alert" className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {t(notice.key)}
          {notice.signIn && <> <a href="/login?next=/map" className="font-medium text-blue-600 underline">{t("signIn")}</a></>}
          {duplicate && (
            <button type="button" className="mt-1 block font-medium text-blue-600 underline" onClick={() => onOpenPlace(duplicate.id)}>
              {t("openExisting", { name: duplicate.name })}
            </button>
          )}
          {!fix && notice.key.startsWith("gps.") && (
            <button type="button" className="mt-1 block font-medium text-blue-600 underline" onClick={() => void locate()}>{t("retry")}</button>
          )}
        </div>
      )}
    </section>
  );
}
