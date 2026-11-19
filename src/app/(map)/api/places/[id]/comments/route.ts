// GET /api/places/:id/comments → comments made straight on a place (display names only).
import { NextResponse, type NextRequest } from "next/server";
import { idSchema } from "@/features/media/validation";
import { createClient } from "@/lib/supabase/server";

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/places/[id]/comments">) {
  const { id } = await ctx.params;
  if (!idSchema.safeParse(id).success) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const supabase = await createClient();
  const [{ data, error }, { data: auth }] = await Promise.all([
    supabase.rpc("place_comments", { p_place: id }),
    supabase.auth.getUser(),
  ]);
  if (error) {
    console.error("place_comments", error.message);
    return NextResponse.json({ error: "unavailable" }, { status: 502 });
  }
  return NextResponse.json({ items: data ?? [], signed_in: !!auth.user }, { headers: { "Cache-Control": "no-store" } });
}
