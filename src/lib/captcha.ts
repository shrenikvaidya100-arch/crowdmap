import "server-only";
import { config } from "@/lib/config";
import { serverEnv } from "@/lib/env";

/**
 * Verifies a Cloudflare Turnstile token on the server. Tokens are single-use,
 * so the browser must fetch a new one after every submit.
 */
export async function verifyCaptcha(token: string | null | undefined, ip?: string | null) {
  if (!token || token.length > 2048) return false;
  const { turnstileSecretKey } = serverEnv();
  if (!turnstileSecretKey) {
    console.error("TURNSTILE_SECRET_KEY is not set; rejecting captcha");
    return false;
  }
  const body = new URLSearchParams({ secret: turnstileSecretKey, response: token });
  if (ip) body.set("remoteip", ip);
  try {
    const res = await fetch(config.captcha.verifyUrl, { method: "POST", body, cache: "no-store" });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch (err) {
    console.error("Turnstile verification failed", err);
    return false;
  }
}
