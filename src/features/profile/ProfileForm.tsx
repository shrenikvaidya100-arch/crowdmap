"use client";
// Edit display name, language and home city. Same validation in the browser
// (on blur and submit) and on the server.
import { useActionState, useState } from "react";
import type { Language } from "@/lib/config";
import { translator } from "@/lib/i18n";
import { displayNameSchema } from "@/lib/validation/auth";
import { updateProfile, type ProfileState } from "./actions";
import { messages } from "./messages";

export function ProfileForm({
  lang, initial, cities,
}: {
  lang: Language;
  initial: { displayName: string; preferredLang: Language; homeCity: string };
  cities: { id: string; name: string; name_hi: string | null }[];
}) {
  const t = translator(messages, lang);
  const [state, action, pending] = useActionState<ProfileState, FormData>(updateProfile, {});
  const [nameError, setNameError] = useState<string | undefined>();

  const checkName = (v: string) => {
    const r = displayNameSchema.safeParse(v);
    return r.success ? undefined : r.error.issues[0]?.message;
  };
  const shownNameError = nameError ?? state.fields?.displayName;

  return (
    <form action={action} noValidate className="max-w-md space-y-4"
          onSubmit={(e) => {
            const err = checkName(String(new FormData(e.currentTarget).get("displayName") ?? ""));
            setNameError(err);
            if (err) e.preventDefault();
          }}>
      <div>
        <label htmlFor="pr-name" className="block text-sm font-medium">{t("displayName")}</label>
        <input id="pr-name" name="displayName" defaultValue={initial.displayName} maxLength={60} autoComplete="nickname"
               onBlur={(e) => setNameError(checkName(e.target.value))} aria-invalid={Boolean(shownNameError)}
               className={`mt-1 w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 ${shownNameError ? "border-red-500" : "border-gray-300 dark:border-gray-600"}`} />
        {shownNameError && <p className="mt-1 text-xs text-red-600">{t(shownNameError)}</p>}
      </div>

      <fieldset>
        <legend className="text-sm font-medium">{t("language")}</legend>
        <div className="mt-1 flex gap-4">
          {(["en", "hi"] as const).map((l) => (
            <label key={l} className="flex items-center gap-2 text-sm">
              <input type="radio" name="preferredLang" value={l} defaultChecked={initial.preferredLang === l} className="accent-blue-600" />
              {t(`lang.${l}`)}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="pr-city" className="block text-sm font-medium">{t("homeCity")}</label>
        <select id="pr-city" name="homeCity" defaultValue={initial.homeCity}
                className="mt-1 w-full rounded-md border border-gray-300 bg-transparent px-3 py-2 text-sm dark:border-gray-600">
          <option value="">{t("noCity")}</option>
          {cities.map((c) => <option key={c.id} value={c.id}>{lang === "hi" && c.name_hi ? c.name_hi : c.name}</option>)}
        </select>
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {pending ? t("saving") : t("save")}
        </button>
        {state.message && (
          <p role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-green-700" : "text-red-600"}`}>{t(state.message)}</p>
        )}
      </div>
    </form>
  );
}
