// GET /api/geo?q=..&lat=..&lng=.. → points on the map (shops, streets, landmarks,
// areas) from OpenStreetMap via Photon, nearest first, India only. Proxied so the
// visitor's IP isn't sent to a third party, and cached for a day.
import { NextResponse, type NextRequest } from "next/server";
import { config } from "@/lib/config";

type Feature = { geometry: { coordinates: [number, number] }; properties: Record<string, string | undefined> };

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").trim();
  const lat = Number(sp.get("lat") ?? 22.72), lng = Number(sp.get("lng") ?? 75.86);
  if (q.length < 2 || q.length > 80 || !Number.isFinite(lat) || !Number.isFinite(lng)) return NextResponse.json({ points: [] });
  try {
    const res = await fetch(config.geocoder.url(q, Math.round(lat * 100) / 100, Math.round(lng * 100) / 100, sp.get("lang") ?? "en"), {
      signal: AbortSignal.timeout(config.geocoder.timeoutMs),
      headers: { "User-Agent": "CrowdMap (student project)" },
      next: { revalidate: 86400 },
    });
    if (!res.ok) return NextResponse.json({ points: [] });
    const j = (await res.json()) as { features?: Feature[] };
    const seen = new Set<string>();
    const points = (j.features ?? [])
      .filter((f) => f.properties.countrycode === "IN" && f.properties.name)
      .map((f) => {
        const p = f.properties;
        const where = [p.street, p.district ?? p.locality, p.city ?? p.county].filter(Boolean).join(", ");
        return { name: p.name!, kind: (p.osm_value ?? p.type ?? "place").replace(/_/g, " "), where, lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] };
      })
      .filter((p) => { const k = `${p.name}|${p.lat.toFixed(3)}|${p.lng.toFixed(3)}`; if (seen.has(k)) return false; seen.add(k); return true; })
      .slice(0, config.geocoder.maxResults);
    return NextResponse.json({ points }, { headers: { "Cache-Control": "public, max-age=300, s-maxage=86400" } });
  } catch {
    return NextResponse.json({ points: [] });
  }
}
