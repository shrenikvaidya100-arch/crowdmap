"use server";
// "I'm planning to go" and cancelling a plan. The database checks the time
// window, the per-user limit and duplicates, and writes the audit log.
import { createClient } from "@/lib/supabase/server";
import { planIdSchema, planSchema } from "./validation";

export type PlanResult = { ok: boolean; reason?: string };

export async function planVisit(input: unknown): Promise<PlanResult> {
  const parsed = planSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return { ok: false, reason: "signin" };
  const { data, error } = await supabase.rpc("plan_visit", { p_place: parsed.data.placeId, p_at: parsed.data.at });
  if (error) {
    console.error("plan_visit", error.message);
    return { ok: false, reason: /account removed/.test(error.message) ? "removed" : "error" };
  }
  return data?.ok ? { ok: true } : { ok: false, reason: data?.reason ?? "error" };
}

export async function cancelPlan(planId: unknown): Promise<PlanResult> {
  const parsed = planIdSchema.safeParse(planId);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("visit_plans").delete().eq("id", parsed.data).select("id");
  if (error) return { ok: false, reason: "error" };
  return data.length ? { ok: true } : { ok: false, reason: "not_found" };
}
