"use client";
// Browser Supabase client, used only to send a file to its one-time upload link.
import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";

let client: ReturnType<typeof createBrowserClient> | null = null;
export function mediaBrowserClient() {
  const { supabaseUrl, supabaseKey } = publicEnv();
  client ??= createBrowserClient(supabaseUrl, supabaseKey);
  return client;
}
