// GET /api/crowd/overview → one row per city (typical crowd now, places, live
// count) so the map can show a crowd bubble for every city when zoomed out.
import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  if (!isSupabaseConfigured()) return NextResponse.json({ cities: [] });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("crowd_overview");
  if (error) {
    console.error("crowd_overview", error.message);
    return NextResponse.json({ error: "unavailable" }, { status: 502 });
  }
  return NextResponse.json({ cities: data ?? [] }, { headers: { "Cache-Control": "public, max-age=60, s-maxage=60" } });
}
