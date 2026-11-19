"use client";
// While enabled, follows the device location and sends a heartbeat about once
// a minute so the place you're at counts you. Stops (and forgets your position
// on the server) when disabled or when the page closes.
import { useEffect, useRef, useState } from "react";
import { sendHeartbeat, stopSharing } from "./presenceActions";

export const PRESENCE_INTERVAL_MS = 60_000;
const STORAGE_KEY = "crowdmap.sharePresence";

export type PresenceState =
  | { state: "off" }
  | { state: "starting" }
  | { state: "on"; placeName: string | null; here: number }
  | { state: "error"; reason: string };

/** Remembered per browser; storage can be unavailable (private mode), so failures are ignored. */
/** On unless this device turned it off ("0"): signed-in people share by default. */
export function loadPresencePreference() {
  try { return localStorage.getItem(STORAGE_KEY) !== "0"; } catch { return false; }
}
export function savePresencePreference(on: boolean) {
  try { localStorage.setItem(STORAGE_KEY, on ? "1" : "0"); } catch { /* ignore */ }
}

export function usePresence(enabled: boolean, onPosition?: (p: { lat: number; lng: number }) => void): PresenceState {
  const onPos = useRef(onPosition);
  useEffect(() => { onPos.current = onPosition; }, [onPosition]);
  const [status, setStatus] = useState<PresenceState>({ state: "off" });
  const latest = useRef<GeolocationCoordinates | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (!("geolocation" in navigator)) {
      queueMicrotask(() => setStatus({ state: "error", reason: "gps.unsupported" }));
      return;
    }
    let stopped = false;
    let sentOnce = false;
    queueMicrotask(() => { if (!stopped) setStatus({ state: "starting" }); });

    async function beat() {
      const c = latest.current;
      if (!c || stopped) return;
      const res = await sendHeartbeat({ lat: c.latitude, lng: c.longitude, accuracy: Math.round(c.accuracy) });
      if (stopped) return;
      if (res.ok) setStatus({ state: "on", placeName: res.placeName ?? null, here: res.here ?? 0 });
      else setStatus({ state: "error", reason: `presence.${res.reason}` });
    }

    const watch = navigator.geolocation.watchPosition(
      (pos) => {
        latest.current = pos.coords;
        onPos.current?.({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        if (!sentOnce) { sentOnce = true; void beat(); }
      },
      (err) => setStatus({ state: "error", reason: err.code === err.PERMISSION_DENIED ? "gps.denied" : err.code === err.POSITION_UNAVAILABLE ? "gps.off" : "gps.timeout" }),
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 20_000 },
    );
    const timer = setInterval(() => void beat(), PRESENCE_INTERVAL_MS);
    // Hidden tab: stop counting. Visible again: count right away.
    const onHide = () => { if (document.visibilityState === "hidden") void stopSharing(); else void beat(); };
    document.addEventListener("visibilitychange", onHide);

    return () => {
      stopped = true;
      navigator.geolocation.clearWatch(watch);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onHide);
      void stopSharing();
      setStatus({ state: "off" });
    };
  }, [enabled]);

  return status;
}
