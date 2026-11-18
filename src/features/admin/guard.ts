import "server-only";
import { notFound } from "next/navigation";
import { getViewer } from "@/lib/session";

/**
 * Call at the top of every admin page. Layouts and pages render in parallel,
 * so the layout's check alone would still let a page start its queries.
 * Non-admins get "not found". The database checks again on every call.
 */
export async function requireAdminPage() {
  const viewer = await getViewer();
  if (viewer?.role !== "admin") notFound();
  return viewer;
}
