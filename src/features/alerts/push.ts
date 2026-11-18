"use client";
// Browser push helpers shared by the Saved page switch and the reminder button.
import { publicEnv } from "@/lib/env";
import { deletePushSubscription, savePushSubscription } from "./actions";

export type PushStatus = "unsupported" | "ios" | "denied" | "off" | "on";

function keyBytes(base64url: string) {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export async function pushStatus(): Promise<PushStatus> {
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (!supported) return /iPhone|iPad|iPod/.test(navigator.userAgent) ? "ios" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration("/");
  return (await reg?.pushManager.getSubscription()) ? "on" : "off";
}

/** Asks for permission (only when needed) and registers this device. */
export async function enablePush(): Promise<PushStatus | "error" | "notConfigured"> {
  const vapid = publicEnv().vapidPublicKey;
  if (!vapid) return "notConfigured";
  const now = await pushStatus();
  if (now !== "off" && now !== "on") return now;
  const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";
  try {
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription())
      ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(vapid) }));
    const res = await savePushSubscription(sub.toJSON());
    if (!res.ok) { await sub.unsubscribe(); return "error"; }
    return "on";
  } catch {
    return "error";
  }
}

export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  if (sub) { await deletePushSubscription(sub.endpoint); await sub.unsubscribe(); }
}
