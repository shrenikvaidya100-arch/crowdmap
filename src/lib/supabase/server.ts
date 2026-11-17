import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { publicEnv, serverEnv } from "@/lib/env";

/**
 * Supabase client acting as the signed-in user (row-level security applies).
 * Use this for all request code.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const { supabaseUrl, supabaseKey } = publicEnv();
  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component, where cookies are read-only. proxy.ts refreshes them.
        }
      },
    },
  });
}

/**
 * Service client that bypasses row-level security. Only for narrow server
 * pipelines (logging failed logins, bot sweeps). Never pass its data to the browser unfiltered.
 */
export function createServiceClient() {
  const { supabaseUrl } = publicEnv();
  const { supabaseSecretKey } = serverEnv();
  return createPlainClient(supabaseUrl, supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
