"use client";
// Keep (dismiss the reports) or hold to hide a reported upload.
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import HoldButton from "@/components/core/hold-button";
import { resolveReports } from "./actions";

export function ReportActions({ mediaId, keepLabel, hideLabel, hideItemLabel, holdingLabel, hiddenLabel }: {
  mediaId: string; keepLabel: string; hideLabel: string; hideItemLabel: string; holdingLabel: string; hiddenLabel: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const act = (a: "keep" | "hide") => start(async () => { await resolveReports(mediaId, a); router.refresh(); });
  return (
    <div className="flex items-center gap-2">
      <button type="button" disabled={pending} onClick={() => act("keep")}
              className="h-8 rounded-lg border border-gray-300 px-3 text-xs font-medium hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800">{keepLabel}</button>
      <HoldButton size="sm" disabled={pending} aria-label={hideItemLabel} holdingLabel={holdingLabel} completeLabel={hiddenLabel}
                  resetAfter={0} onHoldComplete={() => act("hide")}>{hideLabel}</HoldButton>
    </div>
  );
}
