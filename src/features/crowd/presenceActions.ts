"use server";
// Heartbeats while someone shares their location, and "stop sharing". Signed-in
// people are counted by account; guests by a random device id kept in an httpOnly
// cookie, so passive sharing works without signing in (reporting still needs it).
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const beatSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().positive().max(100_000),
});

export type BeatResult = { ok: boolean; reason?: string; placeName?: string | null; here?: number };

const DEVICE = "cm_device";
const UUID = /^[0-9a-f-]{36}$/i;

/** This browser's guest id (created on first use). */
async function deviceId(create: boolean) {
  const jar = await cookies();
  const have = jar.get(DEVICE)?.value;
  if (have && UUID.test(have)) return have;
  if (!create) return null;
  const id = randomUUID();
  jar.set(DEVICE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return id;
}

export async function sendHeartbeat(input: unknown): Promise<BeatResult> {
  const parsed = beatSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  const { lat, lng, accuracy } = parsed.data;
  const { data, error } = user.user
    ? await supabase.rpc("heartbeat", { p_lat: lat, p_lng: lng, p_accuracy: accuracy })
    : await supabase.rpc("heartbeat_anon", { p_device: await deviceId(true), p_lat: lat, p_lng: lng, p_accuracy: accuracy });
  if (error) {
    console.error("heartbeat", error.message);
    return { ok: false, reason: /account removed/.test(error.message) ? "removed" : "error" };
  }
  return { ok: data.ok, reason: data.reason, placeName: data.place_name ?? null, here: data.here ?? 0 };
}

export async function stopSharing(): Promise<void> {
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  if (user.user) { await supabase.rpc("stop_presence"); return; }
  const id = await deviceId(false);
  if (id) await supabase.rpc("stop_presence_anon", { p_device: id });
}
