"use client";
import { Icon } from "@/components/icons/Icon";
// Turn browser notifications on or off for this device (Web Push).
import { useEffect, useState } from "react";
import type { Language } from "@/lib/config";
import { publicEnv } from "@/lib/env";
import { translator } from "@/lib/i18n";
import { deletePushSubscription, savePushSubscription } from "./actions";
import { messages } from "./messages";

type Status = "loading" | "unsupported" | "ios" | "off" | "on" | "denied";

function keyBytes(base64url: string) {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export function PushToggle({ lang }: { lang: Language }) {
  const t = translator(messages, lang);
  const [status, setStatus] = useState<Status>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const vapid = publicEnv().vapidPublicKey;

  useEffect(() => {
    (async () => {
      const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      if (!supported) {
        const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
        return setStatus(ios ? "ios" : "unsupported");
      }
      if (Notification.permission === "denied") return setStatus("denied");
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      setStatus(sub ? "on" : "off");
    })().catch(() => setStatus("unsupported"));
  }, []);

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      if (!vapid) return setError("pushNotConfigured");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setStatus(permission === "denied" ? "denied" : "off");
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(vapid) });
      const res = await savePushSubscription(sub.toJSON());
      if (!res.ok) { await sub.unsubscribe(); return setError("pushError"); }
      setStatus("on");
    } catch {
      setError("pushError");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) { await deletePushSubscription(sub.endpoint); await sub.unsubscribe(); }
      setStatus("off");
    } catch {
      setError("pushError");
    } finally {
      setBusy(false);
    }
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
