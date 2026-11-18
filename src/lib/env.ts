// Reads environment variables in one place. Secrets are only read on the server.

export function publicEnv() {
  return {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
    turnstileSiteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "",
    vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "",
  };
}

/** True once Supabase keys are filled in. Lets the site render before setup. */
export function isSupabaseConfigured() {
  const { supabaseUrl, supabaseKey } = publicEnv();
  return Boolean(supabaseUrl && supabaseKey);
}

export function serverEnv() {
  if (typeof window !== "undefined") throw new Error("serverEnv() called in the browser");
  return {
    supabaseSecretKey: process.env.SUPABASE_SECRET_KEY ?? "",
    turnstileSecretKey: process.env.TURNSTILE_SECRET_KEY ?? "",
    vapidPrivateKey: process.env.VAPID_PRIVATE_KEY ?? "",
  };
}
