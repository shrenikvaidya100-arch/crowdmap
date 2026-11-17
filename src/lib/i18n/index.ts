// Tiny translation helper. Each feature keeps its own strings next to its code:
//   export const messages = { en: { title: "Map" }, hi: { title: "नक्शा" } } satisfies Messages;
// so User 1 and User 2 never edit the same translation file.
import { config, type Language } from "@/lib/config";

export type Dict = Record<string, string>;
export type Messages = { en: Dict; hi: Partial<Dict> };

export const LANG_COOKIE = "lang";

export function isLanguage(v: unknown): v is Language {
  return typeof v === "string" && (config.languages as readonly string[]).includes(v);
}

/** Returns t(key, vars) for one language, falling back to English, then to the key. */
export function translator(messages: Messages, lang: Language) {
  return (key: string, vars?: Record<string, string | number>) => {
    let s = messages[lang]?.[key] ?? messages.en[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  };
}
