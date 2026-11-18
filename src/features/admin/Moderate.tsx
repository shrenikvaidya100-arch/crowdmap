"use client";
// Remove / restore / hide / show button that asks for a reason first.
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Language } from "@/lib/config";
import { translator } from "@/lib/i18n";
import { moderate } from "./actions";
import { messages } from "./messages";
import { reasonSchema } from "./validation";

export function Moderate({ lang, target, id, to, label }: {
  lang: Language;
  target: "user" | "media" | "comment";
  id: string;
  to: "active" | "visible" | "removed";
  label: string;
}) {
  const t = translator(messages, lang);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<{ ok: boolean; key: string } | null>(null);
  const [pending, start] = useTransition();
  const danger = to === "removed";

  if (!open) {
    return (
      <span className="inline-flex flex-col items-start gap-1">
        <button type="button" onClick={() => { setOpen(true); setResult(null); }}
                className={`rounded-md border px-2 py-1 text-xs font-medium ${danger ? "border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950" : "border-green-300 text-green-700 hover:bg-green-50 dark:border-green-800 dark:text-green-300 dark:hover:bg-green-950"}`}>
          {label}
        </button>
        {result && <span role={result.ok ? "status" : "alert"} className={`text-xs ${result.ok ? "text-green-700" : "text-amber-700"}`}>{t(result.key)}</span>}
      </span>
    );
  }

  return (
    <form className="flex min-w-48 flex-col gap-1" onSubmit={(e) => {
      e.preventDefault();
      const parsed = reasonSchema.safeParse(reason);
      if (!parsed.success) return setResult({ ok: false, key: `result.${parsed.error.issues[0].message}` });
      start(async () => {
        const res = await moderate({ target, id, to, reason: parsed.data });
        setResult({ ok: res.ok, key: res.ok ? "result.ok" : `result.${res.reason ?? "error"}` });
        if (res.ok) { setOpen(false); setReason(""); router.refresh(); }
      });
    }}>
      <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder={t("reason")}
             aria-label={t("reason")} className="rounded border border-gray-300 px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-950" />
      <span className="flex gap-2 text-xs">
        <button disabled={pending} className={`rounded px-2 py-1 font-medium text-white disabled:opacity-50 ${danger ? "bg-red-600" : "bg-green-600"}`}>
          {pending ? t("working") : `${label}: ${t("confirm")}`}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-gray-500">{t("cancel")}</button>
      </span>
      {result && !result.ok && <span role="alert" className="text-xs text-amber-700">{t(result.key)}</span>}
    </form>
  );
}
