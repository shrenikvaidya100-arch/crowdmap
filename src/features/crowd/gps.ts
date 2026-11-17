// Collects several GPS readings and summarises them. Spoofers often send one
// fixed point or wildly jumping points; the server checks the spread too.
import { crowdConfig } from "./config";
import type { GpsFix } from "./validation";

export class GpsError extends Error {
  constructor(public code: "unsupported" | "denied" | "timeout" | "inaccurate") { super(code); }
}

function metresBetween(a: GeolocationCoordinates, b: GeolocationCoordinates) {
  const R = 6371000, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude), dLng = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function getGpsFix(): Promise<GpsFix> {
  const { samples, sampleWindowMs, maxAccuracyM } = crowdConfig.gps;
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new GpsError("unsupported"));
    const readings: GeolocationCoordinates[] = [];
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      navigator.geolocation.clearWatch(watch);
      clearTimeout(timer);
      if (readings.length === 0) return reject(new GpsError("timeout"));
      const best = readings.reduce((a, b) => (b.accuracy < a.accuracy ? b : a));
      if (best.accuracy > maxAccuracyM) return reject(new GpsError("inaccurate"));
      const spread = Math.max(0, ...readings.map((r) => metresBetween(r, best)));
      resolve({ lat: best.latitude, lng: best.longitude, accuracy: Math.round(best.accuracy), spread: Math.round(spread) });
    };

    const watch = navigator.geolocation.watchPosition(
      (pos) => { readings.push(pos.coords); if (readings.length >= samples) finish(); },
      (err) => {
        if (done) return;
        done = true;
        navigator.geolocation.clearWatch(watch);
        clearTimeout(timer);
        reject(new GpsError(err.code === err.PERMISSION_DENIED ? "denied" : "timeout"));
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: sampleWindowMs + 4000 },
    );
    const timer = setTimeout(finish, sampleWindowMs + 4000);
  });
}
