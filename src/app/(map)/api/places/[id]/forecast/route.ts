// GET /api/places/:id/forecast?date=YYYY-MM-DD → hourly forecast with weather,
// best time and the caller's plans. Dates: today to 6 days ahead (India time).
import { NextResponse, type NextRequest } from "next/server";
import { idSchema } from "@/features/crowd/validation";
import { buildForecast, indiaDate, PLAN_DAYS } from "@/features/crowd/plan/forecast";
import { dateSchema } from "@/features/crowd/plan/validation";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/places/[id]/forecast">) {
  const { id } = await ctx.params;
  const date = request.nextUrl.searchParams.get("date") ?? indiaDate();
  if (!idSchema.safeParse(id).success || !dateSchema.safeParse(date).success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }
  if (date < indiaDate() || date > indiaDate(PLAN_DAYS - 1)) {
    return NextResponse.json({ error: "date out of range" }, { status: 400 });
  }
  try {
    const forecast = await buildForecast(id, date);
    if (!forecast) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(forecast, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("forecast", (err as Error).message);
    return NextResponse.json({ error: "unavailable" }, { status: 502 });
  }
}
