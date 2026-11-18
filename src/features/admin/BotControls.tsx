"use client";
// "Run check now" and per-flag review buttons on the Bots page.
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Language } from "@/lib/config";
import { translator } from "@/lib/i18n";
import { reviewFlag, runBotSweep, type SweepResult } from "./actions";
import { messages } from "./messages";

export function RunSweep({ lang }: { lang: Language }) {
  const t = translator(messages, lang);
  const router = useRouter();
  const [res, setRes] = useState<SweepResult | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" disabled={pending}
              onClick={() => start(async () => { setRes(await runBotSweep()); router.refresh(); })}
              className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900">
        🤖 {pending ? t("bots.running") : t("bots.runNow")}
      </button>
      {res && (
        <p role="status" className={`rounded-md px-3 py-1.5 text-sm ${res.ok ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200" : "bg-red-50 text-red-800"}`}>
          {res.ok ? t("bots.result", { checked: res.checked ?? 0, removed: res.removed ?? 0, flagged: res.flagged ?? 0 }) : t("result.error")}
        </p>
      )}
    </div>
  );
}

export function ReviewFlag({ lang, flagId }: { lang: Language; flagId: number }) {
  const t = translator(messages, lang);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const act = (falseAlarm: boolean) => start(async () => {
    const res = await reviewFlag({ flagId, falseAlarm });
    if (res.ok) router.refresh(); else setError(`result.${res.reason ?? "error"}`);
  });
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" disabled={pending} onClick={() => act(false)}
              className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">
        {t("bots.reviewed")}
      </button>
      <button type="button" disabled={pending} onClick={() => act(true)}
              className="rounded-md border border-green-300 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-50 dark:border-green-800 dark:text-green-300">
        {t("bots.falseAlarm")}
      </button>
      {error && <span role="alert" className="text-xs text-amber-700">{t(error)}</span>}
    </span>
  );
}
