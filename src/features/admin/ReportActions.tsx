"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { resolveReports } from "./actions";

export function ReportActions({ mediaId, keepLabel, hideLabel }: { mediaId: string; keepLabel: string; hideLabel: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const act = (a: "keep" | "hide") => start(async () => { await resolveReports(mediaId, a); router.refresh(); });
  return (
    <div className="flex gap-2">
      <button type="button" disabled={pending} onClick={() => act("keep")}
              className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800">{keepLabel}</button>
      <button type="button" disabled={pending} onClick={() => act("hide")}
              className="rounded-md border border-red-300 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950">{hideLabel}</button>
    </div>
  );
}
