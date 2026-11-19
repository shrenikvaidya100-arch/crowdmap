// GET /api/cities → every city (id, names, state, centre) for instant search matching.
// Cities rarely change, so the edge keeps this for an hour.
import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  if (!isSupabaseConfigured()) return NextResponse.json([]);
  const supabase = await createClient();
  const { data, error } = await supabase.from("cities").select("id, name, name_hi, state, lat, lng").order("sort_order");
  if (error) return NextResponse.json({ error: "unavailable" }, { status: 502 });
  return NextResponse.json(data, { headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400" } });
}
