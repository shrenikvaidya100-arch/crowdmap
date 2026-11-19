// GET /api/community?city=indore → the newest community photos and videos in a
// city (each with a short-lived link) and its newest posts (comments, alerts).
import { NextResponse, type NextRequest } from "next/server";
import { mediaConfig } from "@/features/media/config";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient, createServiceClient } from "@/lib/supabase/server";

type Row = {
  id: string; kind: string; mime: string; caption: string | null; storage_path: string; created_at: string;
  author: string; place_id: string; place_name: string; comment_count: number; is_sample: boolean;
};

export async function GET(request: NextRequest) {
  const city = request.nextUrl.searchParams.get("city") ?? "";
  if (!/^[a-z0-9-]{2,40}$/.test(city)) return NextResponse.json({ error: "invalid city" }, { status: 400 });
  if (!isSupabaseConfigured()) return NextResponse.json({ media: [], posts: [] });
  const supabase = await createClient();
  const [media, posts] = await Promise.all([
    supabase.rpc("city_media", { p_city: city, p_limit: 24 }),
    supabase.rpc("city_posts", { p_city: city, p_limit: 20 }),
  ]);
  if (media.error || posts.error) {
    console.error("community", media.error?.message ?? posts.error?.message);
    return NextResponse.json({ error: "unavailable" }, { status: 502 });
  }
  const items = (media.data ?? []) as Row[];
  // Only rows the database just said are visible get a link.
  const urls = new Map<string, string>();
  if (items.length) {
    const { data: signed, error } = await createServiceClient().storage.from("media")
      .createSignedUrls(items.map((r) => r.storage_path), mediaConfig.signedUrlSeconds);
    if (error) console.error("community signed urls", error.message);
    for (const s of signed ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
  }
  return NextResponse.json({
    media: items.map(({ storage_path, ...r }) => ({ ...r, url: urls.get(storage_path) ?? null })).filter((r) => r.url),
    posts: posts.data ?? [],
  }, { headers: { "Cache-Control": "no-store" } });
}
