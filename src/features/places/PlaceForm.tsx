"use client";
// Name / Hindi name / category fields with the same validation as the server.
import { useState } from "react";
import ParticleButton from "@/components/core/particle-button";
import type { Language } from "@/lib/config";
import { translator } from "@/lib/i18n";
import { toFieldErrors } from "@/lib/validation/auth";
import { messages } from "./messages";
import { PLACE_CATEGORIES, placeFieldsSchema } from "./validation";

export type PlaceFields = { name: string; nameHi: string; category: string };

export function PlaceForm({
  lang, initial, submitLabel, successLabel, status, busy, onSubmit, onCancel,
}: {
  lang: Language;
  initial?: PlaceFields;
  submitLabel: string;
  /** Shown on the button after a save ("Added"); with it, the burst plays. */
  successLabel?: string;
  /** Result of the last save, for the button. */
  status?: "success" | "error" | "idle";
  busy: boolean;
  onSubmit: (v: PlaceFields) => void;
  onCancel: () => void;
}) {
  const t = translator(messages, lang);
  const [v, setV] = useState<PlaceFields>(initial ?? { name: "", nameHi: "", category: "" });
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});

  const check = (next: PlaceFields) => {
    const r = placeFieldsSchema.safeParse(next);
    return r.success ? {} : toFieldErrors(r.error);
  };
  const set = (patch: Partial<PlaceFields>) => setV((prev) => ({ ...prev, ...patch }));
  const blur = (field: keyof PlaceFields) => setErrors((e) => ({ ...e, [field]: check(v)[field] }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const found = check(v);
    setErrors(found);
    if (Object.keys(found).length === 0) onSubmit(v);
  }

  const input = (bad: boolean) =>
    `w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 ${bad ? "border-red-500" : "border-gray-300 dark:border-gray-600"}`;

  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      <div>
        <label htmlFor="pf-name" className="block text-sm font-medium">{t("name")}</label>
        <input id="pf-name" value={v.name} maxLength={100} autoComplete="off"
               onChange={(e) => set({ name: e.target.value })} onBlur={() => blur("name")}
               aria-invalid={Boolean(errors.name)} aria-describedby="pf-name-msg" className={input(Boolean(errors.name))} />
        <p id="pf-name-msg" className={`text-xs ${errors.name ? "text-red-600" : "text-gray-500"}`}>
          {errors.name ? t(errors.name) : t("nameHint")}
        </p>
      </div>
      <div>
        <label htmlFor="pf-name-hi" className="block text-sm font-medium">{t("nameHi")}</label>
        <input id="pf-name-hi" value={v.nameHi} maxLength={100} lang="hi" autoComplete="off"
               onChange={(e) => set({ nameHi: e.target.value })} onBlur={() => blur("nameHi")}
               aria-invalid={Boolean(errors.nameHi)} className={input(Boolean(errors.nameHi))} />
        {errors.nameHi && <p className="text-xs text-red-600">{t(errors.nameHi)}</p>}
      </div>
      <div>
        <label htmlFor="pf-cat" className="block text-sm font-medium">{t("category")}</label>
        <select id="pf-cat" value={v.category} onChange={(e) => { set({ category: e.target.value }); setErrors((x) => ({ ...x, category: undefined })); }}
                aria-invalid={Boolean(errors.category)} className={input(Boolean(errors.category))}>
          <option value="">{t("chooseCategory")}</option>
          {PLACE_CATEGORIES.map((c) => <option key={c} value={c}>{t(`cat.${c}`)}</option>)}
        </select>
        {errors.category && <p className="text-xs text-red-600">{t(errors.category)}</p>}
      </div>
      <div className="flex gap-2 pt-1">
        <ParticleButton type="submit" fluid className="h-auto flex-1 py-2"
                        status={busy ? "pending" : status ?? "idle"}
                        pendingLabel={t("saving")} successLabel={successLabel ?? submitLabel} errorLabel={t("tryAgain")}>
          {submitLabel}
        </ParticleButton>
        <button type="button" onClick={onCancel}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-800">
          {t("cancel")}
        </button>
      </div>
    </form>
  );
}
