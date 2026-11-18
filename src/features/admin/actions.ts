"use server";
// Admin moderation. The database re-checks that the caller is an active admin,
// refuses to touch admins, and logs every change with its reason.
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { moderateSchema } from "./validation";

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
