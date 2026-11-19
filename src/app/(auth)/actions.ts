"use server";
// Server-side half of login and sign-up. Every rule here is enforced even if
// the browser's checks are bypassed.
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { verifyCaptcha } from "@/lib/captcha";
import { isSupabaseConfigured, serverEnv } from "@/lib/env";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { loginSchema, signupSchema, toFieldErrors, type FieldErrors } from "@/lib/validation/auth";

/** Bumped when the terms change; stored with each new account. */
const TERMS_VERSION = "2026-11";

export type AuthState = {
  message?: string; // translation key
  ok?: boolean;
  fields?: FieldErrors;
  values?: { email?: string; displayName?: string };
};

async function requestInfo() {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return { ip, origin: `${proto}://${host}` };
}

/** Only allow redirects back into this site. */
function safeNext(value: FormDataEntryValue | null) {
  const v = typeof value === "string" ? value : "";
  return v.startsWith("/") && !v.startsWith("//") ? v : "/";
}

const hashEmail = (email: string) => createHash("sha256").update(email).digest("hex").slice(0, 16);

/** Records events for people who are not signed in (e.g. failed logins). */
async function logAnonymous(action: string, details: Record<string, unknown>) {
  if (!serverEnv().supabaseSecretKey) return;
  const { error } = await createServiceClient().rpc("log_event_as", {
    p_actor: null,
    p_actor_role: "anon",
    p_action: action,
    p_details: details,
  });
  if (error) console.error("audit log failed", error.message);
}

type Account = { id: string; confirmed: boolean; providers: string[] } | null;

/** Server-only: does this email have an account, is it confirmed, and how does it sign in? */
async function accountFor(email: string): Promise<Account> {
  if (!serverEnv().supabaseSecretKey) return null;
  const { data } = await createServiceClient().rpc("auth_account_for_email", { p_email: email });
  const row = Array.isArray(data) ? data[0] : null;
  return row ? { id: row.id, confirmed: row.confirmed, providers: row.providers ?? [] } : null;
}

export async function login(_prev: AuthState, form: FormData): Promise<AuthState> {
  const values = { email: String(form.get("email") ?? "") };
  if (!isSupabaseConfigured()) return { message: "auth.notConfigured", values };

  const parsed = loginSchema.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { fields: toFieldErrors(parsed.error), values };

  const { ip } = await requestInfo();
  if (!(await verifyCaptcha(form.get("cf-turnstile-response") as string, ip))) {
    return { message: "auth.captchaFailed", values };
  }

  const supabase = await createClient();
  let { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error && error.status !== 429) {
    const acct = await accountFor(parsed.data.email);
    if (acct && !acct.providers.includes("email") && acct.providers.includes("google")) {
      // Made with Google, so it has no password.
      return { message: "auth.useGoogle", values };
    }
    if (acct && !acct.confirmed && acct.providers.includes("email")) {
      // Accounts stuck waiting for a confirmation email (the mail quota is tiny):
      // confirm them, then try again; the retry still checks the password.
      await createServiceClient().auth.admin.updateUserById(acct.id, { email_confirm: true });
      ({ data, error } = await supabase.auth.signInWithPassword(parsed.data));
    }
  }
  if (error || !data.user) {
    await logAnonymous("auth.login_failed", { email_hash: hashEmail(parsed.data.email), ip });
    const limited = error?.status === 429;
    return { message: limited ? "auth.rateLimited" : "auth.badCredentials", values };
  }

  const { data: profile } = await supabase
    .from("profiles").select("status, avatar_seed").eq("id", data.user.id).single();
  if (profile?.status === "removed") {
    await supabase.rpc("log_event", { p_action: "auth.login_blocked", p_target_type: "profile", p_target_id: data.user.id });
    await supabase.auth.signOut();
    return { message: "auth.removed", values };
  }

  await supabase.rpc("log_event", { p_action: "auth.login", p_details: { method: "password" } });
  const next = safeNext(form.get("next"));
  redirect(profile && !profile.avatar_seed ? `/welcome?next=${encodeURIComponent(next)}` : next);
}

export async function signup(_prev: AuthState, form: FormData): Promise<AuthState> {
  const values = { email: String(form.get("email") ?? ""), displayName: String(form.get("displayName") ?? "") };
  if (!isSupabaseConfigured()) return { message: "auth.notConfigured", values };

  const parsed = signupSchema.safeParse({
    displayName: form.get("displayName"),
    email: form.get("email"),
    password: form.get("password"),
    confirmPassword: form.get("confirmPassword"),
    acceptTerms: form.get("acceptTerms") ?? undefined,
  });
  if (!parsed.success) return { fields: toFieldErrors(parsed.error), values };

  const { ip, origin } = await requestInfo();
  if (!(await verifyCaptcha(form.get("cf-turnstile-response") as string, ip))) {
    return { message: "auth.captchaFailed", values };
  }

  const supabase = await createClient();
  const meta = { display_name: parsed.data.displayName, terms_accepted_at: new Date().toISOString(), terms_version: TERMS_VERSION };

  // Create the account already confirmed, so nobody waits on a confirmation email
  // (Supabase's built-in mailer only sends a few an hour) and there's no cap on sign-ups.
  if (serverEnv().supabaseSecretKey) {
    const existing = await accountFor(parsed.data.email);
    if (existing) return { message: existing.providers.includes("email") ? "auth.emailTaken" : "auth.useGoogle", values };
    const { error: createErr } = await createServiceClient().auth.admin.createUser({
      email: parsed.data.email, password: parsed.data.password, email_confirm: true, user_metadata: meta,
    });
    if (createErr) {
      console.error("signup failed", createErr.status, createErr.message);
      return { message: createErr.status === 422 ? "auth.emailTaken" : "auth.signupFailed", values };
    }
    const { error: inErr } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
    if (inErr) return { ok: true, message: "auth.badCredentials", values: {} };
    redirect("/welcome?next=%2Fmap");
  }

  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: meta,
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });
  if (error) {
    console.error("signup failed", error.status, error.message);
    return { message: error.status === 429 ? "auth.rateLimited" : "auth.signupFailed", values };
  }
  // The profile and the audit entry are created by database triggers.
  if (data.session) redirect("/welcome?next=%2Fmap");
  return { ok: true, message: "auth.checkEmail", values: {} };
}

export async function googleLogin(_prev: AuthState, form: FormData): Promise<AuthState> {
  if (!isSupabaseConfigured()) return { message: "auth.notConfigured" };
  // Signing up with Google needs the same terms box ticked.
  if (form.get("mode") === "signup" && form.get("acceptTerms") !== "on") return { message: "terms.required" };
  const { ip, origin } = await requestInfo();
  // The CAPTCHA is required for Google sign-in too.
  if (!(await verifyCaptcha(form.get("cf-turnstile-response") as string, ip))) {
    return { message: "auth.captchaFailed" };
  }
  const next = safeNext(form.get("next"));
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error || !data.url) return { message: "auth.signupFailed" };
  redirect(data.url);
}

export async function logout() {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.rpc("log_event", { p_action: "auth.logout" });
    await supabase.auth.signOut();
  }
  redirect("/");
}
