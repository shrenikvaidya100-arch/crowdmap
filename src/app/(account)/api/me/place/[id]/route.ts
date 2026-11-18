// GET /api/me/place/:id → is this place saved by me, and am I watching it?
import { NextResponse, type NextRequest } from "next/server";
import { idSchema } from "@/features/alerts/validation";
import { createClient } from "@/lib/supabase/server";

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/me/place/[id]">) {
  const { id } = await ctx.params;
  if (!idSchema.safeParse(id).success) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_place_state", { p_place: id });
  if (error) {
    console.error("my_place_state", error.message);
    return NextResponse.json({ error: "unavailable" }, { status: 502 });
  }
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
