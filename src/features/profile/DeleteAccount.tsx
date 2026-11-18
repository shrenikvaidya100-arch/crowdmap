"use client";
// "Delete my account" card on My activity → Profile.
import { useActionState, useState } from "react";
import type { Language } from "@/lib/config";
import { translator } from "@/lib/i18n";
import { deleteAccount, type DeleteAccountState } from "./actions";
import { messages } from "./messages";

export function DeleteAccount({ lang }: { lang: Language }) {
  const t = translator(messages, lang);
  const [state, action, pending] = useActionState<DeleteAccountState, FormData>(deleteAccount, {});
  const [typed, setTyped] = useState("");
  return (
    <section className="mt-8 rounded-lg border border-red-200 p-4 dark:border-red-900">
      <h2 className="font-medium text-red-700 dark:text-red-300">{t("deleteAccount.title")}</h2>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{t("deleteAccount.body")}</p>
      <form action={action} className="mt-3 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          {t("deleteAccount.typeLabel")}
          <input name="confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" maxLength={10}
                 className="w-40 rounded-md border border-gray-300 bg-transparent px-2 py-1.5 dark:border-gray-600" />
        </label>
        <button disabled={pending || typed.trim() !== "DELETE"}
                className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
          {pending ? t("deleteAccount.working") : t("deleteAccount.button")}
        </button>
      </form>
      {state.message && <p role="alert" className="mt-2 text-sm text-red-600">{t(state.message)}</p>}
    </section>
  );
}
