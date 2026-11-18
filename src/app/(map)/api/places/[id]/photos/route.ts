// GET /api/places/:id/photos → up to 4 public photos of a place from the web,
// for the place card when nobody has posted one yet. Sources (free, no key):
//   1. the Wikipedia article whose title matches the place, near its location;
//   2. geotagged Wikimedia Commons photos taken right at the place.
// Each photo carries its author and licence. Also returns a satellite view of
// the spot so the card is never empty. Cached for a day.
import { NextResponse, type NextRequest } from "next/server";
import { idSchema } from "@/features/crowd/validation";
import { config } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";

type WebPhoto = { url: string; credit: string; source: "wikipedia" | "commons" };

const HEADERS = { "User-Agent": "CrowdMap/1.0 (https://crowdmap-kappa.vercel.app)" };
const strip = (html: string | undefined) => (html ?? "").replace(/<[^>]*>/g, "").replace(/["“”]/g, "")
  .replace(/\s+/g, " ").replace(/[\s,;]+$/, "").trim();
const words = (s: string) => new Set(s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]/g, " ").split(" ").filter((w) => w.length >= 3));

async function getJson(url: string) {
  const r = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(config.webPhotos.timeoutMs), next: { revalidate: 86400 } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

const SKIP = /logo|map|plan|flag|seal|emblem|icon|diagram|sign|symbol|locator/i;

/** Photos (JPEGs) from a list of file pages, with author and licence. */
function toPhotos(pages: { title: string; imageinfo?: { thumburl?: string; mime: string; extmetadata?: Record<string, { value?: string }> }[] }[], source: WebPhoto["source"]) {
  return pages.flatMap((p) => {
    const info = p.imageinfo?.[0];
    if (!info?.thumburl || info.mime !== "image/jpeg" || SKIP.test(p.title)) return [];
    const artist = strip(info.extmetadata?.Artist?.value).slice(0, 60) || "Unknown";
    const licence = strip(info.extmetadata?.LicenseShortName?.value);
    return [{ url: info.thumburl, credit: `${artist}${licence ? `, ${licence}` : ""} · ${source === "wikipedia" ? "Wikipedia" : "Wikimedia Commons"}`, source }];
  });
}

async function wikipedia(name: string, lat: number, lng: number): Promise<WebPhoto[]> {
  // 1. The article about this place: near it, and its title shares a real word with the name.
  const search = new URLSearchParams({
    action: "query", format: "json", origin: "*", list: "search", srlimit: "3",
    srsearch: `${name} nearcoord:${config.webPhotos.wikiRadiusKm}km,${lat},${lng}`,
  });
  const found = await getJson(`https://en.wikipedia.org/w/api.php?${search}`);
  const want = words(name);
  const title = ((found?.query?.search ?? []) as { title: string }[]).find((r) => [...words(r.title)].some((w) => want.has(w)))?.title;
  if (!title) return [];
  // 2. The photos in that article (logos, maps and flags left out).
  const q = new URLSearchParams({
    action: "query", format: "json", origin: "*", titles: title, generator: "images", gimlimit: "30",
    prop: "imageinfo", iiprop: "url|mime|extmetadata", iiurlwidth: "900",
  });
  const data = await getJson(`https://en.wikipedia.org/w/api.php?${q}`);
  return toPhotos(Object.values(data?.query?.pages ?? {}), "wikipedia").slice(0, 3);
}

async function commons(lat: number, lng: number, radius: number): Promise<WebPhoto[]> {
  const q = new URLSearchParams({
    action: "query", format: "json", origin: "*", generator: "geosearch", ggsnamespace: "6",
    ggscoord: `${lat}|${lng}`, ggsradius: String(radius), ggslimit: "10",
    prop: "imageinfo", iiprop: "url|mime|extmetadata", iiurlwidth: "900",
  });
  const data = await getJson(`https://commons.wikimedia.org/w/api.php?${q}`);
  const pages = Object.values(data?.query?.pages ?? {}) as {
    title: string; imageinfo?: { thumburl?: string; mime: string; extmetadata?: Record<string, { value?: string }> }[];
  }[];
  return toPhotos(pages, "commons");
}

/** A satellite picture (Esri World Imagery) centred on the place. */
function satellite(lat: number, lng: number) {
  const d = 0.0018; // ~200 m each way
  const dx = d / Math.cos((lat * Math.PI) / 180);
  const q = new URLSearchParams({
    bbox: `${lng - dx},${lat - d},${lng + dx},${lat + d}`, bboxSR: "4326", imageSR: "3857",
    size: "640,420", format: "jpg", f: "image",
  });
  return { url: `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?${q}`, credit: "Satellite: Esri, Maxar, Earthstar Geographics" };
}

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/places/[id]/photos">) {
  const { id } = await ctx.params;
  if (!idSchema.safeParse(id).success) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const supabase = await createClient();
  const { data: place, error } = await supabase.from("places").select("name, lat, lng, radius_m").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: "unavailable" }, { status: 502 });
  if (!place) return NextResponse.json({ error: "not found" }, { status: 404 });

  const [wiki, near] = await Promise.all([
    wikipedia(place.name, place.lat, place.lng).catch(() => []),
    commons(place.lat, place.lng, Math.min(place.radius_m ?? 150, config.webPhotos.commonsRadiusM)).catch(() => []),
  ]);
  const seen = new Set<string>();
  const photos = [...wiki, ...near].filter((p) => !seen.has(p.url) && seen.add(p.url)).slice(0, 4);
  return NextResponse.json({ photos, satellite: satellite(place.lat, place.lng) },
    { headers: { "Cache-Control": "public, max-age=600, s-maxage=86400" } });
}
