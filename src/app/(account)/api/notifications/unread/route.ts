// GET /api/notifications/unread → { count } for the header bell.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ count: 0 }, { headers: { "Cache-Control": "no-store" } });
  const { count, error } = await supabase.from("notifications").select("id", { count: "exact", head: true })
    .eq("user_id", auth.user.id).is("read_at", null);
  if (error) console.error("unread count", error.message);
  return NextResponse.json({ count: count ?? 0 }, { headers: { "Cache-Control": "no-store" } });
}
