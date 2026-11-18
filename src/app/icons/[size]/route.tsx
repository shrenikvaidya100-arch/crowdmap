// /icons/192, /icons/512 and /icons/512-maskable: PNG app icons for the manifest.
import { brandIcon } from "@/app/brand-icon";

const SIZES: Record<string, { size: number; maskable: boolean }> = {
  "192": { size: 192, maskable: false },
  "512": { size: 512, maskable: false },
  "512-maskable": { size: 512, maskable: true },
};

export async function GET(_req: Request, ctx: RouteContext<"/icons/[size]">) {
  const spec = SIZES[(await ctx.params).size];
  if (!spec) return new Response("Not found", { status: 404 });
  const res = brandIcon(spec.size, { maskable: spec.maskable });
  res.headers.set("Cache-Control", "public, max-age=604800, immutable");
  return res;
}
