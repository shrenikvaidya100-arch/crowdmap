import "server-only";
import { notFound, redirect } from "next/navigation";
import { getViewer } from "@/lib/session";
import { isUnlocked } from "./gate";

/**
 * Call at the top of every admin page. Layouts and pages render in parallel,
 * so the layout's check alone would still let a page start its queries.
 * Non-admins get "not found"; admins who haven't typed the code yet are sent
 * to the admin check. The database checks the role again on every call.
 */
export async function requireAdminPage() {
  const viewer = await getViewer();
  if (viewer?.role !== "admin") notFound();
  if (!(await isUnlocked(viewer.id))) redirect("/admin-check");
  return viewer;
}
