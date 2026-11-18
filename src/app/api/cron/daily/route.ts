// GET /api/cron/daily: run once a day by Vercel Cron (vercel.json).
// Removes files of unfinished or deleted uploads, and keeps the free Supabase
// database awake (it pauses after a week without requests).
// Vercel sends "Authorization: Bearer <CRON_SECRET>"; anything else is refused.
import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: "CRON_SECRET not set" }, { status: 503 });
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("media_cleanup_candidates", { p_limit: 500 });
  if (error) {
    console.error("cron cleanup candidates", error.message);
    return NextResponse.json({ error: "unavailable" }, { status: 502 });
  }
  const paths = ((data ?? []) as { path: string }[]).map((r) => r.path);
  let removed = 0;
  for (let i = 0; i < paths.length; i += 100) {
    const batch = paths.slice(i, i + 100);
    const { data: gone, error: rmError } = await supabase.storage.from("media").remove(batch);
    if (rmError) console.error("cron remove files", rmError.message);
    removed += gone?.length ?? 0;
  }
  const { data: rows, error: doneError } = await supabase.rpc("media_cleanup_done", {
    p_paths: paths, p_files_removed: removed,
  });
  if (doneError) console.error("cron cleanup done", doneError.message);
  return NextResponse.json({ ok: true, candidates: paths.length, files_removed: removed, rows_removed: rows ?? 0 });
}
