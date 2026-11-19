"use server";
// Admin check: the typed code unlocks the admin area; Lock ends it early.
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/session";
import { checkAnswer, lock } from "./gate";

export type GateState = { error?: "wrong" | "expired" | "empty" } | null;

export async function unlockAdmin(_prev: GateState, form: FormData): Promise<GateState> {
  const viewer = await getViewer();
  if (viewer?.role !== "admin") redirect("/");
  const answer = String(form.get("code") ?? "").trim();
  if (!answer) return { error: "empty" };
  const r = await checkAnswer(viewer.id, answer);
  if (r !== "ok") return { error: r };
  redirect("/admin");
}

export async function lockAdmin() {
  await lock();
  redirect("/");
}
