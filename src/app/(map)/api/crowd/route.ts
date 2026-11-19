// GET /api/crowd?city=indore → places with crowd levels, plus active alerts.
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const city = request.nextUrl.searchParams.get("city") ?? "";
  if (!/^[a-z0-9-]{2,40}$/.test(city)) {
    return NextResponse.json({ error: "invalid city" }, { status: 400 });
  }
  if (!isSupabaseConfigured()) return NextResponse.json({ places: [], alerts: [] });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("crowd_map", { p_city: city });
  if (error) {
    console.error("crowd_map", error.message);
    return NextResponse.json({ error: "unavailable" }, { status: 502 });
  }
  // The same for everyone, so Vercel's edge can serve it for 20 s (stale up to a minute
  // while it refreshes). ?fresh=1 skips that, after your own report or a live update.
  const fresh = request.nextUrl.searchParams.get("fresh") === "1";
  return NextResponse.json(data, {
    headers: { "Cache-Control": fresh ? "no-store" : "public, max-age=0, s-maxage=20, stale-while-revalidate=60" },
  });
}
