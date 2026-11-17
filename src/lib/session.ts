import "server-only";
import { cache } from "react";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export type Viewer = {
  id: string;
  displayName: string;
  role: "user" | "admin";
} | null;

/** The signed-in user's profile, or null. Cached per request. */
export const getViewer = cache(async (): Promise<Viewer> => {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { data: profile } = await supabase
    .from("profiles").select("display_name, role, status").eq("id", data.user.id).single();
  if (!profile || profile.status !== "active") return null;
  return { id: data.user.id, displayName: profile.display_name, role: profile.role };
});
