"use server";
// Crowd reports and quick reports. Input is re-validated here; the database
// functions then check the location, rate limits and account status.
import { createClient } from "@/lib/supabase/server";
import {
  crowdReportSchema, idSchema, quickReportSchema, updateReportSchema, voteSchema,
} from "./validation";

/** reason is a translation key under "result.*". */
export type ActionResult = { ok: boolean; reason?: string };

async function signedInClient() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user ? supabase : null;
}

function fromRpc(data: unknown, error: { message: string } | null): ActionResult {
  if (error) {
    console.error("crowd rpc", error.message);
    if (/account removed/.test(error.message)) return { ok: false, reason: "removed" };
    return { ok: false, reason: "error" };
  }
  const d = data as { ok?: boolean; reason?: string } | null;
  return d?.ok ? { ok: true } : { ok: false, reason: d?.reason ?? "error" };
}

export async function submitCrowdReport(input: unknown): Promise<ActionResult> {
  const parsed = crowdReportSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const supabase = await signedInClient();
  if (!supabase) return { ok: false, reason: "signin" };
  const { placeId, level, fix } = parsed.data;
  const { data, error } = await supabase.rpc("submit_crowd_report", {
    p_place: placeId, p_level: level, p_lat: fix.lat, p_lng: fix.lng,
    p_accuracy: fix.accuracy, p_spread: fix.spread,
  });
  return fromRpc(data, error);
}

export async function updateCrowdReport(input: unknown): Promise<ActionResult> {
  const parsed = updateReportSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const supabase = await signedInClient();
  if (!supabase) return { ok: false, reason: "signin" };
  // Row-level security only allows the owner, within 15 minutes.
  const { data, error } = await supabase.from("crowd_reports")
    .update({ level: parsed.data.level }).eq("id", parsed.data.reportId).select("id");
  if (error) return { ok: false, reason: "error" };
  return data.length ? { ok: true } : { ok: false, reason: "not_editable" };
}

export async function deleteCrowdReport(reportId: unknown): Promise<ActionResult> {
  const parsed = idSchema.safeParse(reportId);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const supabase = await signedInClient();
  if (!supabase) return { ok: false, reason: "signin" };
  const { data, error } = await supabase.from("crowd_reports").delete().eq("id", parsed.data).select("id");
  if (error) return { ok: false, reason: "error" };
  return data.length ? { ok: true } : { ok: false, reason: "not_editable" };
}

export async function submitQuickReport(input: unknown): Promise<ActionResult> {
  const parsed = quickReportSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const supabase = await signedInClient();
  if (!supabase) return { ok: false, reason: "signin" };
  const { kind, placeId, fix } = parsed.data;
  const { data, error } = await supabase.rpc("submit_quick_report", {
    p_kind: kind, p_place: placeId, p_lat: fix.lat, p_lng: fix.lng,
    p_accuracy: fix.accuracy, p_spread: fix.spread,
  });
  return fromRpc(data, error);
}

export async function voteQuickReport(input: unknown): Promise<ActionResult> {
  const parsed = voteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const supabase = await signedInClient();
  if (!supabase) return { ok: false, reason: "signin" };
  const { reportId, stillThere, fix } = parsed.data;
  const { data, error } = await supabase.rpc("vote_quick_report", {
    p_report: reportId, p_still_there: stillThere, p_lat: fix.lat, p_lng: fix.lng,
    p_accuracy: fix.accuracy, p_spread: fix.spread,
  });
  return fromRpc(data, error);
}

export async function deleteQuickReport(reportId: unknown): Promise<ActionResult> {
  const parsed = idSchema.safeParse(reportId);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const supabase = await signedInClient();
  if (!supabase) return { ok: false, reason: "signin" };
  const { data, error } = await supabase.from("quick_reports").delete().eq("id", parsed.data).select("id");
  if (error) return { ok: false, reason: "error" };
  if (data.length) await supabase.rpc("log_event", { p_action: "quick.delete", p_target_type: "quick_report", p_target_id: parsed.data });
  return data.length ? { ok: true } : { ok: false, reason: "not_editable" };
}
