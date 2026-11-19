// GET /api/search?q=khajrana&city=indore → up to 8 ranked suggestions (all cities).
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { searchQuerySchema } from "@/features/search/validation";

export async function GET(request: NextRequest) {
  const parsed = searchQuerySchema.safeParse({
    q: request.nextUrl.searchParams.get("q") ?? "",
    city: request.nextUrl.searchParams.get("city") ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: "invalid query" }, { status: 400 });
  if (!isSupabaseConfigured()) return NextResponse.json([]);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_places", {
    p_query: parsed.data.q, p_city: parsed.data.city ?? null, p_limit: 8,
  });
  if (error) {
    console.error("search_places", error.message);
    return NextResponse.json({ error: "unavailable" }, { status: 502 });
  }
  // Same answer for everyone: Vercel's edge keeps it 5 minutes (refreshing in the background
  // for an hour), so popular searches return instantly.
  return NextResponse.json(data, { headers: { "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=3600" } });
}
