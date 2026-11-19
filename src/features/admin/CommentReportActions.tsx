"use client";
// Keep (dismiss the reports) or remove a reported comment.
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { resolveCommentReports } from "./actions";

export function CommentReportActions({ commentId, keepLabel, removeLabel }: { commentId: string; keepLabel: string; removeLabel: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const act = (a: "keep" | "remove") => start(async () => { await resolveCommentReports(commentId, a); router.refresh(); });
  return (
    <div className="flex items-center gap-2">
      <button type="button" disabled={pending} onClick={() => act("keep")}
              className="h-8 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900">{keepLabel}</button>
      <button type="button" disabled={pending} onClick={() => act("remove")}
              className="h-8 rounded-lg bg-red-600 px-3 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50">{removeLabel}</button>
    </div>
  );
}
