// The viewer's own map extras, kept in this browser only: dropped markers,
// drawn shapes, and the map style. Every read and write is guarded, because
// storage can be blocked (private windows, strict settings).
import { DEFAULT_PREFS, type MapPrefs } from "../mapLayers";

export type UserMarker = { id: string; name: string; color: string; lat: number; lng: number; at: number };
export type Shape = { id: string; kind: "point" | "line" | "area"; name: string; color: string; coords: [number, number][]; at: number };

const KEYS = { markers: "crowdmap.markers", shapes: "crowdmap.shapes", prefs: "crowdmap.mapStyle" };

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}
function write(key: string, value: unknown) {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

export const loadMarkers = () => read<UserMarker[]>(KEYS.markers, []).filter((m) => Number.isFinite(m.lat) && Number.isFinite(m.lng)).slice(0, 200);
export const saveMarkers = (m: UserMarker[]) => write(KEYS.markers, m.slice(0, 200));
export const loadShapes = () => read<Shape[]>(KEYS.shapes, []).slice(0, 100);
export const saveShapes = (s: Shape[]) => write(KEYS.shapes, s.slice(0, 100));
export const loadPrefs = (): MapPrefs => ({ ...DEFAULT_PREFS, ...read<Partial<MapPrefs>>(KEYS.prefs, {}) });
export const savePrefs = (p: MapPrefs) => write(KEYS.prefs, p);
export const clearPrefs = () => { try { window.localStorage.removeItem(KEYS.prefs); } catch { /* ignore */ } };

export const newId = () => Math.random().toString(36).slice(2, 10);
export const MARKER_COLORS = ["#0894FF", "#16a34a", "#eab308", "#f97316", "#dc2626", "#e5e7eb"];
