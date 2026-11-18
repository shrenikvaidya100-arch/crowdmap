// Shared by the browser and the server actions.
import { z } from "zod";

export const reasonSchema = z.string().trim().min(3, "need_reason").max(200, "reason_too_long");

export const moderateSchema = z.object({
  target: z.enum(["user", "media", "comment"]),
  id: z.string().uuid(),
  /** user: active | removed; media and comments: visible | removed */
  to: z.enum(["active", "visible", "removed"]),
  reason: reasonSchema,
}).refine((v) => v.target === "user" ? v.to !== "visible" : v.to !== "active", { message: "invalid" });

/** Reads one search param as a trimmed string (or undefined). */
export function param(sp: Record<string, string | string[] | undefined>, key: string, max = 100) {
  const v = sp[key];
  const s = (Array.isArray(v) ? v[0] : v)?.trim();
  return s ? s.slice(0, max) : undefined;
}
export function pick<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(value ?? "") ? (value as T) : fallback;
}
export function pageNumber(value: string | undefined) {
  const n = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(n) && n > 0 && n < 10_000 ? n : 1;
}
