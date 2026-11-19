// GET /api/crowd/pending?lat=..&lng=.. → places within a few hundred metres with a
// crowd report waiting for a second person (never the caller's own), nearest first.
import { NextResponse, type NextRequest } from "next/server";
import { config } from "@/lib/config";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const lat = Number(request.nextUrl.searchParams.get("lat"));
  const lng = Number(request.nextUrl.searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ error: "invalid position" }, { status: 400 });
  }
  if (!isSupabaseConfigured()) return NextResponse.json({ places: [] });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("nearby_pending", { p_lat: lat, p_lng: lng, p_radius_m: config.crowd.confirmRadiusM });
  if (error) {
    console.error("nearby_pending", error.message);
    return NextResponse.json({ error: "unavailable" }, { status: 502 });
  }
  return NextResponse.json({ places: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}
