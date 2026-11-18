"use client";
import { Icon } from "@/components/icons/Icon";
// Save and "Remind me when quieter" in the place panel.
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Language } from "@/lib/config";
import { translator } from "@/lib/i18n";
import { toggleSaved } from "./actions";
import { messages } from "./messages";
import { Reminder } from "./Reminder";

type State = { signed_in: boolean; saved: boolean };

export function PlaceActions({ placeId, placeName, lang }: { placeId: string; placeName: string; lang: Language }) {
  const t = translator(messages, lang);
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/me/place/${placeId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d) setState(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [placeId, version]);

  if (!state) return null;
  if (!state.signed_in) {
    return (
      <Link href="/login?next=/map" className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
        <Icon name="star" size={16} /> {t("signInFirst")}
      </Link>
    );
  }

  async function save() {
    setBusy(true);
    setError(null);
    const r = await toggleSaved(placeId);
    setBusy(false);
    if (r.ok) setVersion((v) => v + 1);
    else setError(`result.${r.reason ?? "error"}`);
  }

  return (
    <section className="flex flex-wrap items-start gap-2">
      <button type="button" disabled={busy} aria-pressed={state.saved} onClick={save}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${state.saved ? "border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200" : "border-gray-300 dark:border-gray-700"}`}>
        <Icon name={state.saved ? "star_filled" : "star"} size={16} /> {state.saved ? t("saved") : t("save")}
      </button>
      <Reminder placeId={placeId} placeName={placeName} lang={lang} />
      {error && <p role="alert" className="w-full text-sm text-amber-700">{t(error)}</p>}
    </section>
  );
}
