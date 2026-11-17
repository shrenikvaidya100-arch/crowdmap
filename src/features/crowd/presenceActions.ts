"use server";
// Heartbeats while a user shares their location, and "stop sharing".
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const beatSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().positive().max(10_000),
});

export type BeatResult = { ok: boolean; reason?: string; placeName?: string | null; here?: number };

export async function sendHeartbeat(input: unknown): Promise<BeatResult> {
  const parsed = beatSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return { ok: false, reason: "signin" };
  const { data, error } = await supabase.rpc("heartbeat", {
    p_lat: parsed.data.lat, p_lng: parsed.data.lng, p_accuracy: parsed.data.accuracy,
  });
  if (error) {
    console.error("heartbeat", error.message);
    return { ok: false, reason: /account removed/.test(error.message) ? "removed" : "error" };
  }
  return { ok: data.ok, reason: data.reason, placeName: data.place_name ?? null, here: data.here ?? 0 };
}

export async function stopSharing(): Promise<void> {
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  if (user.user) await supabase.rpc("stop_presence");
}
