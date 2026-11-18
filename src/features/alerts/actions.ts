"use server";
// Saved places, "tell me when it's quiet" alerts, the inbox and push devices.
// The database functions check the account, limits and ownership again.
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { idSchema, pushSubscriptionSchema, watchSchema } from "./validation";

export type AlertResult = { ok: boolean; reason?: string; saved?: boolean; level?: number; source?: string };

async function signedIn() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user ? supabase : null;
}
function fromRpc(data: unknown, error: { message: string } | null): AlertResult {
  if (error) {
    console.error("alerts rpc", error.message);
    if (/account removed/.test(error.message)) return { ok: false, reason: "removed" };
    if (/not found/.test(error.message)) return { ok: false, reason: "not_found" };
    return { ok: false, reason: "error" };
  }
  return (data ?? { ok: false, reason: "error" }) as AlertResult;
}

export async function toggleSaved(placeId: unknown): Promise<AlertResult> {
  if (!idSchema.safeParse(placeId).success) return { ok: false, reason: "invalid" };
  const supabase = await signedIn();
  if (!supabase) return { ok: false, reason: "signin" };
  const { data, error } = await supabase.rpc("toggle_saved_place", { p_place: placeId });
  revalidatePath("/saved");
  return fromRpc(data, error);
}

export async function watchPlace(input: unknown): Promise<AlertResult> {
  const parsed = watchSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const supabase = await signedIn();
  if (!supabase) return { ok: false, reason: "signin" };
  const { data, error } = await supabase.rpc("watch_place", { p_place: parsed.data.placeId, p_hours: parsed.data.hours, p_target: 2 });
  revalidatePath("/saved");
  return fromRpc(data, error);
}

export async function cancelWatch(watchId: unknown): Promise<AlertResult> {
  if (!idSchema.safeParse(watchId).success) return { ok: false, reason: "invalid" };
  const supabase = await signedIn();
  if (!supabase) return { ok: false, reason: "signin" };
  const { data, error } = await supabase.rpc("cancel_watch", { p_watch: watchId });
  revalidatePath("/saved");
  return fromRpc(data, error);
}

export async function markAllRead(): Promise<void> {
  const supabase = await signedIn();
  if (!supabase) return;
  const { error } = await supabase.rpc("mark_notifications_read", { p_ids: null });
  if (error) console.error("mark read", error.message);
}

export async function savePushSubscription(input: unknown): Promise<AlertResult> {
  const parsed = pushSubscriptionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const supabase = await signedIn();
  if (!supabase) return { ok: false, reason: "signin" };
  const ua = (await headers()).get("user-agent") ?? null;
  const { data, error } = await supabase.rpc("save_push_subscription", {
    p_endpoint: parsed.data.endpoint, p_p256dh: parsed.data.keys.p256dh, p_auth: parsed.data.keys.auth, p_user_agent: ua,
  });
  return fromRpc(data, error);
}

export async function deletePushSubscription(endpoint: unknown): Promise<AlertResult> {
  if (typeof endpoint !== "string" || endpoint.length > 1000) return { ok: false, reason: "invalid" };
  const supabase = await signedIn();
  if (!supabase) return { ok: false, reason: "signin" };
  const { data, error } = await supabase.rpc("delete_push_subscription", { p_endpoint: endpoint });
  return fromRpc(data, error);
}
