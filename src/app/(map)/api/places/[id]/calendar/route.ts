// GET /api/places/:id/calendar → one expected crowd level per day for the
// next config.crowd.calendarDays days (India time), for the crowd calendar.
import { NextResponse } from "next/server";
import { idSchema } from "@/features/crowd/validation";
import { config } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";

export async function GET(_request: Request, ctx: RouteContext<"/api/places/[id]/calendar">) {
  const { id } = await ctx.params;
  if (!idSchema.safeParse(id).success) return NextResponse.json({ error: "invalid request" }, { status: 400 });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("forecast_calendar", { p_place: id, p_days: config.crowd.calendarDays });
  if (error) {
    console.error("calendar", error.message);
    return NextResponse.json({ error: "unavailable" }, { status: 502 });
  }
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  // The same for everyone and it changes slowly: let the browser keep it a few minutes.
  return NextResponse.json(data, { headers: { "Cache-Control": "private, max-age=300" } });
}
