"use client";
import { Icon } from "@/components/icons/Icon";
// Turn browser notifications on or off for this device (Web Push).
import { useEffect, useState } from "react";
import type { Language } from "@/lib/config";
import { translator } from "@/lib/i18n";
import { disablePush, enablePush, pushStatus } from "./push";
import { messages } from "./messages";

type Status = "loading" | "unsupported" | "ios" | "off" | "on" | "denied";

export function PushToggle({ lang }: { lang: Language }) {
  const t = translator(messages, lang);
  const [status, setStatus] = useState<Status>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { pushStatus().then(setStatus).catch(() => setStatus("unsupported")); }, []);

  async function enable() {
    setBusy(true);
    setError(null);
    const r = await enablePush();
    setBusy(false);
    if (r === "notConfigured") setError("pushNotConfigured");
    else if (r === "error") setError("pushError");
    else setStatus(r);
  }

  async function disable() {
    setBusy(true);
    setError(null);
    try { await disablePush(); setStatus("off"); } catch { setError("pushError"); } finally { setBusy(false); }
  }

  return (
    <section className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
      <h2 className="flex items-center gap-2 font-medium"><Icon name="phone_notify" size={18} /> {t("push")}</h2>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
        {status === "on" ? t("pushOn") : status === "denied" ? t("pushDenied") : status === "ios" ? t("pushIos")
          : status === "unsupported" ? t("pushUnsupported") : status === "loading" ? "…" : t("pushOff")}
      </p>
      {(status === "off" || status === "on") && (
        <button type="button" disabled={busy} onClick={status === "on" ? disable : enable}
                className={`mt-3 rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50 ${status === "on" ? "border border-gray-300 dark:border-gray-700" : "bg-blue-600 text-white"}`}>
          {busy ? t("pushWorking") : status === "on" ? t("pushDisable") : t("pushEnable")}
        </button>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-red-600">{t(error)}</p>}
    </section>
  );
}
