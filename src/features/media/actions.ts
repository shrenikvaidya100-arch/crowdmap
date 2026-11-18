"use server";
// Media uploads and comments. Input is re-validated here; the database
// functions then check location, rate limits, text and account status.
// Files go straight from the browser to Storage with a one-time signed URL.
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  addCommentSchema, beginUploadSchema, editCaptionSchema, editCommentSchema, idSchema,
} from "./validation";

/** reason is a translation key under "result.*". */
export type MediaResult = { ok: boolean; reason?: string };
export type UploadSlot = MediaResult & { id?: string; path?: string; token?: string };

async function signedInClient() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user ? supabase : null;
}

function fromRpc(data: unknown, error: { message: string } | null): MediaResult & Record<string, unknown> {
  if (error) {
    console.error("media rpc", error.message);
    if (/account removed/.test(error.message)) return { ok: false, reason: "removed" };
    if (/not found/.test(error.message)) return { ok: false, reason: "not_found" };
    return { ok: false, reason: "error" };
  }
  const d = (data ?? {}) as { ok?: boolean; reason?: string } & Record<string, unknown>;
  return d.ok ? { ...d, ok: true } : { ok: false, reason: d.reason ?? "error" };
}

export async function beginUpload(input: unknown): Promise<UploadSlot> {
  const parsed = beginUploadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: parsed.error.issues[0]?.message ?? "invalid" };
  const supabase = await signedInClient();
  if (!supabase) return { ok: false, reason: "signin" };
  const v = parsed.data;
  const { data, error } = await supabase.rpc("begin_media_upload", {
    p_place: v.placeId, p_kind: v.kind, p_mime: v.mime, p_size: v.size,
    p_duration: v.duration, p_caption: v.caption || null,
    p_lat: v.fix.lat, p_lng: v.fix.lng, p_accuracy: v.fix.accuracy, p_spread: v.fix.spread,
  });
  const res = fromRpc(data, error);
  if (!res.ok) return res;
  const id = res.id as string, path = res.path as string;
  // The bucket is private: only the server can mint an upload link, for exactly this path.
  const { data: signed, error: signError } = await createServiceClient()
    .storage.from("media").createSignedUploadUrl(path);
  if (signError || !signed) {
    console.error("media upload url", signError?.message);
    return { ok: false, reason: "error" };
  }
  return { ok: true, id, path, token: signed.token };
}

export async function finishUpload(mediaId: unknown): Promise<MediaResult> {
  const parsed = idSchema.safeParse(mediaId);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const supabase = await signedInClient();
  if (!supabase) return { ok: false, reason: "signin" };
  const { data, error } = await supabase.rpc("finish_media_upload", { p_media: parsed.data });
  return fromRpc(data, error);
}

export async function editCaption(input: unknown): Promise<MediaResult> {
  const parsed = editCaptionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: parsed.error.issues[0]?.message ?? "invalid" };
  const supabase = await signedInClient();
  if (!supabase) return { ok: false, reason: "signin" };
  const { data, error } = await supabase.rpc("edit_my_media", {
    p_media: parsed.data.mediaId, p_caption: parsed.data.caption || null,
  });
  return fromRpc(data, error);
}

export async function deleteMedia(mediaId: unknown): Promise<MediaResult> {
  const parsed = idSchema.safeParse(mediaId);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const supabase = await signedInClient();
  if (!supabase) return { ok: false, reason: "signin" };
  const { data, error } = await supabase.rpc("delete_my_media", { p_media: parsed.data });
  const res = fromRpc(data, error);
  if (res.ok && typeof res.path === "string") {
    const { error: rmError } = await createServiceClient().storage.from("media").remove([res.path]);
    if (rmError) console.error("media remove file", rmError.message);
  }
  return { ok: res.ok, reason: res.reason };
}

export async function addComment(input: unknown): Promise<MediaResult> {
  const parsed = addCommentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: parsed.error.issues[0]?.message ?? "invalid" };
  const supabase = await signedInClient();
  if (!supabase) return { ok: false, reason: "signin" };
  const { data, error } = await supabase.rpc("add_comment", { p_media: parsed.data.mediaId, p_body: parsed.data.body });
  return fromRpc(data, error);
}

export async function editComment(input: unknown): Promise<MediaResult> {
  const parsed = editCommentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: parsed.error.issues[0]?.message ?? "invalid" };
  const supabase = await signedInClient();
  if (!supabase) return { ok: false, reason: "signin" };
  const { data, error } = await supabase.rpc("edit_my_comment", { p_comment: parsed.data.commentId, p_body: parsed.data.body });
  return fromRpc(data, error);
}

export async function deleteComment(commentId: unknown): Promise<MediaResult> {
  const parsed = idSchema.safeParse(commentId);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const supabase = await signedInClient();
  if (!supabase) return { ok: false, reason: "signin" };
  const { data, error } = await supabase.rpc("delete_my_comment", { p_comment: parsed.data });
  return fromRpc(data, error);
}

const REPORT_REASONS = ["inappropriate", "not_this_place", "private_info", "spam", "other"] as const;

/** "Report photo / video": puts the upload in the admin review queue. */
export async function reportMedia(input: unknown): Promise<MediaResult> {
  const v = input as { mediaId?: unknown; reason?: unknown; note?: unknown } | null;
  if (!idSchema.safeParse(v?.mediaId).success || !REPORT_REASONS.includes(v?.reason as never)) return { ok: false, reason: "invalid" };
  const note = typeof v?.note === "string" ? v.note.trim().slice(0, 200) : null;
  const supabase = await signedInClient();
  if (!supabase) return { ok: false, reason: "signin" };
  const { data, error } = await supabase.rpc("report_media", { p_media: v!.mediaId, p_reason: v!.reason, p_note: note || null });
  return fromRpc(data, error);
}
