import "server-only";
// The admin check: a short code drawn as a distorted picture that the admin types
// in. Cookies hold only signed hashes (never the code). One try per code; a right
// answer unlocks the admin area for a while, for that admin only.
import { createHash, createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { config } from "@/lib/config";
import { serverEnv } from "@/lib/env";

const CHALLENGE = "cm_admin_challenge";
const UNLOCK = "cm_admin_unlock";
const cfg = config.adminGate;

function key() {
  const base = process.env.ADMIN_GATE_SECRET || serverEnv().supabaseSecretKey;
  if (!base) throw new Error("admin gate needs ADMIN_GATE_SECRET or SUPABASE_SECRET_KEY");
  return createHash("sha256").update(`crowdmap-admin-gate:${base}`).digest();
}
const sign = (s: string) => createHmac("sha256", key()).update(s).digest("base64url");
function same(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
const cookieBase = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" as const, path: "/" };

/** A new code for this admin; the cookie keeps only its signed hash. */
export async function newChallenge(userId: string) {
  let code = "";
  for (let i = 0; i < cfg.codeLength; i++) code += cfg.alphabet[randomInt(cfg.alphabet.length)];
  const exp = Date.now() + cfg.codeTtlSec * 1000;
  (await cookies()).set(CHALLENGE, `${exp}.${sign(`${userId}|${code}|${exp}`)}`, { ...cookieBase, maxAge: cfg.codeTtlSec });
  return code;
}

export type GateResult = "ok" | "wrong" | "expired";

/** Checks the typed code. Either way the code is used up (one try per code). */
export async function checkAnswer(userId: string, answer: string): Promise<GateResult> {
  const jar = await cookies();
  const raw = jar.get(CHALLENGE)?.value ?? "";
  jar.delete(CHALLENGE);
  const [expStr, mac] = raw.split(".");
  const exp = Number(expStr);
  if (!mac || !Number.isFinite(exp) || exp < Date.now()) return "expired";
  const typed = answer.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!same(mac, sign(`${userId}|${typed}|${exp}`))) return "wrong";
  const until = Date.now() + cfg.unlockMinutes * 60_000;
  jar.set(UNLOCK, `${until}.${sign(`${userId}|unlock|${until}`)}`, { ...cookieBase, maxAge: cfg.unlockMinutes * 60 });
  return "ok";
}

export async function isUnlocked(userId: string) {
  const [untilStr, mac] = ((await cookies()).get(UNLOCK)?.value ?? "").split(".");
  const until = Number(untilStr);
  return !!mac && Number.isFinite(until) && until > Date.now() && same(mac, sign(`${userId}|unlock|${until}`));
}

export async function lock() {
  (await cookies()).delete(UNLOCK);
}

/** The code drawn as an SVG: tilted letters, wavy distortion and noise lines. */
export function codeSvg(code: string) {
  const W = 260, H = 84;
  const r = (a: number, b: number) => a + Math.random() * (b - a);
  const colors = ["#1e3a8a", "#7c2d12", "#14532d", "#581c87", "#0f172a", "#9f1239"];
  const letters = [...code].map((ch, i) => {
    const x = 26 + i * ((W - 40) / code.length) + r(-4, 4);
    const y = H / 2 + r(8, 16);
    return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${r(32, 40).toFixed(0)}" font-family="Georgia, 'Times New Roman', serif" font-weight="700" fill="${colors[randomInt(colors.length)]}" transform="rotate(${r(-24, 24).toFixed(0)} ${x.toFixed(0)} ${y.toFixed(0)}) skewX(${r(-12, 12).toFixed(0)})">${ch}</text>`;
  }).join("");
  const lines = Array.from({ length: 7 }, () =>
    `<path d="M${r(0, 40).toFixed(0)} ${r(5, H - 5).toFixed(0)} C ${r(60, 120).toFixed(0)} ${r(0, H).toFixed(0)}, ${r(140, 200).toFixed(0)} ${r(0, H).toFixed(0)}, ${r(220, W).toFixed(0)} ${r(5, H - 5).toFixed(0)}" stroke="${colors[randomInt(colors.length)]}" stroke-opacity="${r(0.35, 0.7).toFixed(2)}" stroke-width="${r(1, 2.4).toFixed(1)}" fill="none"/>`).join("");
  const dots = Array.from({ length: 90 }, () =>
    `<circle cx="${r(0, W).toFixed(0)}" cy="${r(0, H).toFixed(0)}" r="${r(0.6, 1.8).toFixed(1)}" fill="#334155" fill-opacity="${r(0.2, 0.6).toFixed(2)}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs><filter id="w"><feTurbulence type="fractalNoise" baseFrequency="${r(0.012, 0.02).toFixed(3)} ${r(0.04, 0.07).toFixed(3)}" numOctaves="2" seed="${randomInt(999)}"/><feDisplacementMap in="SourceGraphic" scale="${r(7, 11).toFixed(0)}"/></filter></defs>
<rect width="100%" height="100%" fill="#f5f1e8"/>${dots}<g filter="url(#w)">${letters}</g>${lines}</svg>`;
}
