// GET /api/media/:id/comments → visible comments on one upload (display names only).
import { NextResponse, type NextRequest } from "next/server";
import { idSchema } from "@/features/media/validation";
import { createClient } from "@/lib/supabase/server";

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/media/[id]/comments">) {
  const { id } = await ctx.params;
  if (!idSchema.safeParse(id).success) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("media_comments", { p_media: id });
  if (error) {
    console.error("media_comments", error.message);
    return NextResponse.json({ error: "unavailable" }, { status: 502 });
  }
  return NextResponse.json({ items: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}
