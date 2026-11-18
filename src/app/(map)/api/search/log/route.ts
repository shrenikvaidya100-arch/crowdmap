// POST /api/search/log { q, city?, results } → records one search for the admin
// Insights page: the words, city and result count only, never who searched.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const body = z.object({
  q: z.string().trim().min(2).max(60),
  city: z.string().regex(/^[a-z0-9-]{2,40}$/).optional(),
  results: z.number().int().min(0).max(100),
});

export async function POST(request: NextRequest) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const { data: auth } = await (await createClient()).auth.getUser();
  const { error } = await createServiceClient().rpc("log_search", {
    p_query: parsed.data.q, p_city: parsed.data.city ?? null, p_results: parsed.data.results, p_signed_in: !!auth.user,
  });
  if (error) console.error("log_search", error.message);
  return new NextResponse(null, { status: 204 });
}
