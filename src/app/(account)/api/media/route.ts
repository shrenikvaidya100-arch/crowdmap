// GET /api/media?place=<id> → visible photos, videos and audio for a place,
// each with a short-lived link to the file. No uploader ids are returned.
import { NextResponse, type NextRequest } from "next/server";
import { mediaConfig } from "@/features/media/config";
import { idSchema } from "@/features/media/validation";
import { createClient, createServiceClient } from "@/lib/supabase/server";

type Row = {
  id: string; kind: string; mime: string; caption: string | null; duration_s: number | null; storage_path: string;
  created_at: string; edited_at: string | null; author: string; mine: boolean; comment_count: number; is_sample: boolean;
};

export async function GET(request: NextRequest) {
  const place = request.nextUrl.searchParams.get("place");
  if (!idSchema.safeParse(place).success) return NextResponse.json({ error: "invalid place" }, { status: 400 });
  const supabase = await createClient();
  const [{ data: rows, error }, { data: auth }, { data: locationRequired }] = await Promise.all([
    supabase.rpc("place_media", { p_place: place, p_limit: 30 }),
    supabase.auth.getUser(),
    supabase.rpc("media_location_required"),
  ]);
  if (error) {
    console.error("place_media", error.message);
    return NextResponse.json({ error: "unavailable" }, { status: 502 });
  }
  const items = (rows ?? []) as Row[];
  // Only rows the database just said are visible get a link.
  const urls = new Map<string, string>();
  if (items.length) {
    const { data: signed, error: signError } = await createServiceClient().storage.from("media")
      .createSignedUrls(items.map((r) => r.storage_path), mediaConfig.signedUrlSeconds);
    if (signError) console.error("media signed urls", signError.message);
    for (const s of signed ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
  }
  return NextResponse.json({
    signed_in: !!auth.user,
    // Whether uploads must be made at the place right now (an admin switch).
    location_required: locationRequired !== false,
    items: items.map(({ storage_path, ...r }) => ({ ...r, url: urls.get(storage_path) ?? null })),
  }, { headers: { "Cache-Control": "no-store" } });
}
