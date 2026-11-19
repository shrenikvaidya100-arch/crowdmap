"use server";
// Admin moderation. The database re-checks that the caller is an active admin,
// refuses to touch admins, and logs every change with its reason.
import { revalidatePath } from "next/cache";
import { getViewer } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { isUnlocked } from "./gate";
import { moderateSchema, reviewFlagSchema } from "./validation";

/** Admin actions also need the admin check to have been passed (the database checks the role). */
async function unlocked() {
  const viewer = await getViewer();
  return viewer?.role === "admin" && (await isUnlocked(viewer.id));
}

export type AdminResult = { ok: boolean; reason?: string };

function fromRpc(data: unknown, error: { message: string } | null): AdminResult {
  if (error) {
    console.error("admin rpc", error.message);
    if (/admins only/.test(error.message)) return { ok: false, reason: "admins_only" };
    if (/not found/.test(error.message)) return { ok: false, reason: "not_found" };
    return { ok: false, reason: "error" };
  }
  const d = data as { ok?: boolean; reason?: string } | null;
  return d?.ok ? { ok: true } : { ok: false, reason: d?.reason ?? "error" };
}

export async function moderate(input: unknown): Promise<AdminResult> {
  if (!(await unlocked())) return { ok: false, reason: "locked" };
  const parsed = moderateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: parsed.error.issues[0]?.message ?? "invalid" };
  const { target, id, to, reason } = parsed.data;
  const supabase = await createClient();
  const call = target === "user"
    ? supabase.rpc("admin_set_user_status", { p_user: id, p_status: to, p_reason: reason })
    : target === "media"
      ? supabase.rpc("admin_set_media_status", { p_media: id, p_status: to, p_reason: reason })
      : supabase.rpc("admin_set_comment_status", { p_comment: id, p_status: to, p_reason: reason });
  const { data, error } = await call;
  const res = fromRpc(data, error);
  if (res.ok) revalidatePath("/admin", "layout");
  return res;
}

export type ChainResult = { ok: boolean; intact?: boolean; firstBadId?: number | null; entries?: number };

export async function verifyChain(): Promise<ChainResult> {
  if (!(await unlocked())) return { ok: false };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_verify_audit_chain");
  if (error) {
    console.error("admin verify chain", error.message);
    return { ok: false };
  }
  const d = data as { intact: boolean; first_bad_id: number | null; entries: number };
  revalidatePath("/admin/log");
  return { ok: true, intact: d.intact, firstBadId: d.first_bad_id, entries: d.entries };
}

export type SweepResult = { ok: boolean; checked?: number; removed?: number; flagged?: number };

export async function runBotSweep(): Promise<SweepResult> {
  if (!(await unlocked())) return { ok: false };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_run_bot_sweep");
  if (error) {
    console.error("admin bot sweep", error.message);
    return { ok: false };
  }
  revalidatePath("/admin", "layout");
  return { ok: true, ...(data as { checked: number; removed: number; flagged: number }) };
}

export async function reviewFlag(input: unknown): Promise<AdminResult> {
  if (!(await unlocked())) return { ok: false, reason: "locked" };
  const parsed = reviewFlagSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_review_flag", {
    p_flag: parsed.data.flagId, p_false_alarm: parsed.data.falseAlarm,
  });
  const res = fromRpc(data, error);
  if (res.ok) revalidatePath("/admin", "layout");
  return res;
}

/** Review queue: keep the upload (dismiss its reports) or hide it. */
export async function resolveReports(mediaId: string, action: "keep" | "hide"): Promise<AdminResult> {
  if (!/^[0-9a-f-]{36}$/i.test(mediaId) || (action !== "keep" && action !== "hide")) return { ok: false, reason: "invalid" };
  if (!(await unlocked())) return { ok: false, reason: "locked" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_resolve_reports", { p_media: mediaId, p_action: action });
  const res = fromRpc(data, error);
  if (res.ok) revalidatePath("/admin", "layout");
  return res;
}

/** Admin switch: whether photos, videos and voice notes must be posted from the place. */
export async function setMediaLocationRequired(form: FormData): Promise<void> {
  if (!(await unlocked())) return;
  const required = form.get("required") === "true";
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_media_location", { p_required: required });
  if (error) console.error("admin media location", error.message);
  revalidatePath("/admin");
}

/** Reported comment: keep it (dismiss the reports) or remove it. */
export async function resolveCommentReports(commentId: string, action: "keep" | "remove"): Promise<AdminResult> {
  if (!/^[0-9a-f-]{36}$/i.test(commentId) || (action !== "keep" && action !== "remove")) return { ok: false, reason: "invalid" };
  if (!(await unlocked())) return { ok: false, reason: "locked" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_resolve_comment_reports", { p_comment: commentId, p_action: action });
  const res = fromRpc(data, error);
  if (res.ok) revalidatePath("/admin", "layout");
  return res;
}

const UUID_RE = /^[0-9a-f-]{36}$/i;

/** From the map: clear a place's recent reports, alerts and people counted there. */
export async function clearPlaceInputs(placeId: unknown): Promise<AdminResult & { reports?: number; alerts?: number; people?: number }> {
  if (typeof placeId !== "string" || !UUID_RE.test(placeId)) return { ok: false, reason: "invalid" };
  if (!(await unlocked())) return { ok: false, reason: "locked" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_clear_place_inputs", { p_place: placeId });
  const res = fromRpc(data, error);
  if (!res.ok) return res;
  const d = data as { reports: number; alerts: number; people: number };
  revalidatePath("/admin", "layout");
  return { ok: true, reports: d.reports, alerts: d.alerts, people: d.people };
}

/** From the map: delete one alert pin. */
export async function deleteAlert(alertId: unknown): Promise<AdminResult> {
  if (typeof alertId !== "string" || !UUID_RE.test(alertId)) return { ok: false, reason: "invalid" };
  if (!(await unlocked())) return { ok: false, reason: "locked" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_delete_alert", { p_alert: alertId });
  const res = fromRpc(data, error);
  if (res.ok) revalidatePath("/admin", "layout");
  return res;
}

/** Two-person rule: push "is it crowded?" to people near a place now. */
export async function pushConfirm(placeId: unknown): Promise<AdminResult & { asked?: number }> {
  if (typeof placeId !== "string" || !UUID_RE.test(placeId)) return { ok: false, reason: "invalid" };
  if (!(await unlocked())) return { ok: false, reason: "locked" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_push_confirm", { p_place: placeId });
  const res = fromRpc(data, error);
  if (res.ok) revalidatePath("/admin");
  return res.ok ? { ok: true, asked: (data as { asked: number }).asked } : res;
}

/** A test notification to this admin's own devices. */
export async function testPush(): Promise<AdminResult & { devices?: number }> {
  if (!(await unlocked())) return { ok: false, reason: "locked" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_test_push");
  const res = fromRpc(data, error);
  return res.ok ? { ok: true, devices: (data as { devices: number }).devices } : res;
}
