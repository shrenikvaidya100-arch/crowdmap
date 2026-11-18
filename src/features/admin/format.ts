// Dates in India time for admin tables.
import type { Language } from "@/lib/config";

export function formatWhen(iso: string | null | undefined, lang: Language) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(lang === "hi" ? "hi-IN" : "en-IN", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata",
  }).format(new Date(iso));
}
