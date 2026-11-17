"use server";
// Add, confirm, edit and delete user-added places. Input is validated here
// again; the database checks GPS, duplicates, limits and account standing.
import { createClient } from "@/lib/supabase/server";
import { idSchema } from "@/features/crowd/validation";
import { addPlaceSchema, confirmPlaceSchema, editPlaceSchema } from "./validation";

export type PlaceResult = {
  ok: boolean; reason?: string;
  id?: string; cityId?: string; status?: string;
  duplicate?: { id: string; name: string };
};

async function rpc(fn: string, args: Record<string, unknown>): Promise<PlaceResult> {
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return { ok: false, reason: "signin" };
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    console.error(fn, error.message);
    return { ok: false, reason: /account removed/.test(error.message) ? "removed" : "error" };
  }
  const d = data as { ok: boolean; reason?: string; id?: string; city_id?: string; status?: string; place_id?: string; name?: string };
  return {
    ok: d.ok, reason: d.reason, id: d.id, cityId: d.city_id, status: d.status,
    duplicate: d.reason === "duplicate" && d.place_id ? { id: d.place_id, name: d.name ?? "" } : undefined,
  };
}

export async function addPlace(input: unknown): Promise<PlaceResult> {
  const parsed = addPlaceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const { name, nameHi, category, fix } = parsed.data;
  return rpc("add_place", {
    p_name: name, p_name_hi: nameHi || null, p_category: category,
    p_lat: fix.lat, p_lng: fix.lng, p_accuracy: fix.accuracy, p_spread: fix.spread,
  });
}

export async function confirmPlace(input: unknown): Promise<PlaceResult> {
  const parsed = confirmPlaceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const { placeId, exists, fix } = parsed.data;
  return rpc("confirm_place", {
    p_place: placeId, p_exists: exists, p_lat: fix.lat, p_lng: fix.lng, p_accuracy: fix.accuracy, p_spread: fix.spread,
  });
}

export async function editMyPlace(input: unknown): Promise<PlaceResult> {
  const parsed = editPlaceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const { placeId, name, nameHi, category } = parsed.data;
  return rpc("edit_my_place", { p_place: placeId, p_name: name, p_name_hi: nameHi || null, p_category: category });
}

export async function deleteMyPlace(placeId: unknown): Promise<PlaceResult> {
  const parsed = idSchema.safeParse(placeId);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  return rpc("delete_my_place", { p_place: parsed.data });
}
