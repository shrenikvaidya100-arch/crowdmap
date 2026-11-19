// GET /admin-check/code → a fresh code picture for the admin check (admins only).
import { NextResponse } from "next/server";
import { codeSvg, newChallenge } from "@/features/admin/gate";
import { getViewer } from "@/lib/session";

export async function GET() {
  const viewer = await getViewer();
  if (viewer?.role !== "admin") return new NextResponse("Not found", { status: 404 });
  const code = await newChallenge(viewer.id);
  return new NextResponse(codeSvg(code), {
    headers: { "Content-Type": "image/svg+xml", "Cache-Control": "no-store, max-age=0", "X-Robots-Tag": "noindex" },
  });
}
