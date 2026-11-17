// GET /api/places/:id → one place's panel data (crowd, today's pattern, alerts, my report).
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { idSchema } from "@/features/crowd/validation";

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/places/[id]">) {
  const { id } = await ctx.params;
  if (!idSchema.safeParse(id).success) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("place_details", { p_place: id });
  if (error) {
    console.error("place_details", error.message);
    return NextResponse.json({ error: "unavailable" }, { status: 502 });
  }
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
