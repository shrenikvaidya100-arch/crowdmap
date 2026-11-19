// POST /api/push/send: called by the database (pg_net) when notifications need a
// push. The database sends a token only it knows; we check it before doing anything.
// Sends each pending notification to every device of its recipient (Web Push).
import { NextResponse, type NextRequest } from "next/server";
import webpush from "web-push";
import { notificationText, type NotificationData } from "@/features/alerts/text";
import { publicEnv, serverEnv } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const SITE = "https://crowdmap-kappa.vercel.app";

type Pending = { id: number; kind: string; place_id: string | null; data: NotificationData; lang: "en" | "hi"; devices: { endpoint: string; p256dh: string; auth: string }[] };

export async function POST(request: NextRequest) {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  const supabase = createServiceClient();
  if (!token || token.length > 200) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: ok } = await supabase.rpc("verify_push_token", { p_token: token });
  if (ok !== true) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { vapidPublicKey } = publicEnv();
  const { vapidPrivateKey } = serverEnv();
  if (!vapidPublicKey || !vapidPrivateKey) return NextResponse.json({ error: "push keys not set" }, { status: 503 });
  // Web Push needs an https (or mailto) contact for the sender; local dev runs on http.
  const subject = request.nextUrl.protocol === "https:" ? request.nextUrl.origin : SITE;
  webpush.setVapidDetails(subject, vapidPublicKey, vapidPrivateKey);

  const { data, error } = await supabase.rpc("pending_pushes", { p_limit: 100 });
  if (error) {
    console.error("pending pushes", error.message);
    return NextResponse.json({ error: "unavailable" }, { status: 502 });
  }
  const sent: number[] = [], failed: number[] = [], gone: string[] = [];
  await Promise.all(((data ?? []) as Pending[]).map(async (n) => {
    const text = notificationText(n.kind, n.data, n.lang);
    const payload = JSON.stringify({ ...text, url: n.place_id ? `/map?place=${n.place_id}${n.kind === "confirm_crowd" ? "&confirm=1" : ""}` : "/saved", tag: `place-${n.place_id}` });
    let delivered = 0;
    await Promise.all(n.devices.map(async (d) => {
      try {
        await webpush.sendNotification({ endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } }, payload, { TTL: 3600 });
        delivered++;
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) gone.push(d.endpoint);   // device unsubscribed
        else console.error("push send", code, (err as Error).message);
      }
    }));
    (delivered > 0 ? sent : failed).push(n.id);
  }));
  const { error: doneError } = await supabase.rpc("push_results", { p_sent: sent, p_failed: failed, p_gone: gone });
  if (doneError) console.error("push results", doneError.message);
  return NextResponse.json({ ok: true, sent: sent.length, failed: failed.length, removed_devices: gone.length });
}
