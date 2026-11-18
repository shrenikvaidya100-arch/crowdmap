// One theme setting for the whole site: light, dark, or follow the device
// (system). Saved in localStorage, applied as the `dark` class on <html>.
// The navbar switch, the account menu and the map dock all use this store.
import { useSyncExternalStore } from "react";
import { THEME_KEY } from "./theme-script";

export type ThemeChoice = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const listeners = new Set<() => void>();

export function readTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

const systemDark = () => window.matchMedia("(prefers-color-scheme: dark)").matches;

export function resolveTheme(c: ThemeChoice): ResolvedTheme {
  return c === "system" ? (systemDark() ? "dark" : "light") : c;
}

function apply(c: ThemeChoice) {
  const r = resolveTheme(c);
  const root = document.documentElement;
  root.classList.toggle("dark", r === "dark");
  root.style.colorScheme = r;
}

export function setTheme(c: ThemeChoice) {
  try {
    if (c === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, c);
  } catch {
    // Private mode: the choice still applies to this page.
  }
  apply(c);
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onSystem = () => {
    if (readTheme() === "system") apply("system");
    listener();
  };
  // Another tab changed it.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== THEME_KEY) return;
    apply(readTheme());
    listener();
  };
  mq.addEventListener("change", onSystem);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    mq.removeEventListener("change", onSystem);
    window.removeEventListener("storage", onStorage);
  };
}

const resolvedNow = () => resolveTheme(readTheme());

/** The saved choice and the theme actually shown. Server render assumes system/light. */
export function useTheme() {
  const choice = useSyncExternalStore(subscribe, readTheme, () => "system" as ThemeChoice);
  const resolved = useSyncExternalStore(subscribe, resolvedNow, () => "light" as ResolvedTheme);
  return { choice, resolved, setTheme };
}
