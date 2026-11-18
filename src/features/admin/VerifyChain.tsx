"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Language } from "@/lib/config";
import { translator } from "@/lib/i18n";
import { verifyChain, type ChainResult } from "./actions";
import { messages } from "./messages";

export function VerifyChain({ lang }: { lang: Language }) {
  const t = translator(messages, lang);
  const router = useRouter();
  const [res, setRes] = useState<ChainResult | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" disabled={pending}
              onClick={() => start(async () => { setRes(await verifyChain()); router.refresh(); })}
              className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900">
        🔗 {pending ? t("verifying") : t("verify")}
      </button>
      {res && (
        <p role={res.ok && res.intact ? "status" : "alert"}
           className={`rounded-md px-3 py-1.5 text-sm ${res.ok && res.intact ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200" : "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"}`}>
          {!res.ok ? t("verifyFailed") : res.intact ? `✓ ${t("intact", { n: res.entries ?? 0 })}` : `✗ ${t("broken", { id: res.firstBadId ?? "?" })}`}
        </p>
      )}
    </div>
  );
}
