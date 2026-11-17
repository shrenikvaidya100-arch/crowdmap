"use client";
// Login and sign-up form. Validates in the browser with the same rules the
// server uses, and requires the CAPTCHA before any submit (including Google).
import Link from "next/link";
import { useActionState, useState } from "react";
import { Turnstile } from "@/components/Turnstile";
import type { Language } from "@/lib/config";
import { common } from "@/lib/i18n/common";
import { translator } from "@/lib/i18n";
import { loginSchema, signupSchema, toFieldErrors, type FieldErrors } from "@/lib/validation/auth";
import { googleLogin, login, signup, type AuthState } from "./actions";

type Mode = "login" | "signup";

export function AuthForm({
  mode, lang, siteKey, next, initialMessage,
}: {
  mode: Mode;
  lang: Language;
  siteKey: string;
  next: string;
  initialMessage?: string;
}) {
  const t = translator(common, lang);
  const [state, action, pending] = useActionState<AuthState, FormData>(
    mode === "login" ? login : signup,
    { message: initialMessage },
  );
  const [googleState, googleAction, googlePending] = useActionState<AuthState, FormData>(googleLogin, {});
  const [token, setToken] = useState("");
  const [clientErrors, setClientErrors] = useState<FieldErrors>({});
  const [captchaMissing, setCaptchaMissing] = useState(false);

  // Server results arrive as new state objects; the CAPTCHA resets on each one.
  const errors = { ...state.fields, ...clientErrors };
  const message = captchaMissing ? "auth.captchaRequired" : googleState.message ?? state.message;

  function validate(form: HTMLFormElement) {
    const data = Object.fromEntries(new FormData(form));
    const result = (mode === "login" ? loginSchema : signupSchema).safeParse(data);
    return result.success ? {} : toFieldErrors(result.error);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    const found = validate(e.currentTarget);
    setClientErrors(found);
    setCaptchaMissing(!token);
    if (Object.keys(found).length > 0 || !token) e.preventDefault();
  }

  function onBlur(e: React.FocusEvent<HTMLFormElement>) {
    const field = e.target instanceof HTMLInputElement ? e.target.name : "";
    if (!field) return;
    const found = validate(e.currentTarget);
    setClientErrors((prev) => ({ ...prev, [field]: found[field] }));
  }

  function onGoogle(e: React.FormEvent<HTMLFormElement>) {
    setCaptchaMissing(!token);
    if (!token) e.preventDefault();
  }

  const busy = pending || googlePending;
  const isError = message && !state.ok;

  return (
    <div className="mx-auto w-full max-w-sm space-y-5">
      <h1 className="text-2xl font-semibold">
        {t(mode === "login" ? "auth.loginTitle" : "auth.signupTitle")}
      </h1>

      {message && (
        <p role={isError ? "alert" : "status"}
           className={`rounded-md px-3 py-2 text-sm ${isError ? "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200" : "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200"}`}>
          {t(message)}
        </p>
      )}

      <form action={action} onSubmit={onSubmit} onBlur={onBlur} noValidate className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="cf-turnstile-response" value={token} />
        {mode === "signup" && (
          <Field name="displayName" label={t("auth.displayName")} autoComplete="nickname"
                 defaultValue={state.values?.displayName} error={errors.displayName && t(errors.displayName)} />
        )}
        <Field name="email" type="email" label={t("auth.email")} autoComplete="email"
               defaultValue={state.values?.email} error={errors.email && t(errors.email)} />
        <Field name="password" type="password" label={t("auth.password")}
               autoComplete={mode === "login" ? "current-password" : "new-password"}
               hint={mode === "signup" ? t("auth.passwordHint") : undefined}
               error={errors.password && t(errors.password)} />
        {mode === "signup" && (
          <Field name="confirmPassword" type="password" label={t("auth.confirmPassword")}
                 autoComplete="new-password" error={errors.confirmPassword && t(errors.confirmPassword)} />
        )}

        <Turnstile siteKey={siteKey} lang={lang} resetSignal={[state, googleState]}
                   onToken={(v) => { setToken(v); if (v) setCaptchaMissing(false); }} />

        <button type="submit" disabled={busy}
                className="w-full rounded-md bg-blue-600 px-4 py-2.5 font-medium text-white hover:bg-blue-700 disabled:opacity-60">
          {pending ? t("auth.working") : t(mode === "login" ? "auth.loginButton" : "auth.signupButton")}
        </button>
      </form>

      <div className="flex items-center gap-3 text-xs text-gray-500">
        <span className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />{t("auth.or")}<span className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
      </div>

      <form action={googleAction} onSubmit={onGoogle}>
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="cf-turnstile-response" value={token} />
        <button type="submit" disabled={busy}
                className="w-full rounded-md border border-gray-300 px-4 py-2.5 font-medium hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:hover:bg-gray-800">
          {googlePending ? t("auth.working") : t("auth.google")}
        </button>
      </form>

      <p className="text-center text-sm text-gray-600 dark:text-gray-400">
        {mode === "login" ? (
          <>{t("auth.noAccount")} <Link className="text-blue-600 hover:underline" href="/signup">{t("nav.signup")}</Link></>
        ) : (
          <>{t("auth.haveAccount")} <Link className="text-blue-600 hover:underline" href="/login">{t("nav.login")}</Link></>
        )}
      </p>
    </div>
  );
}

function Field({
  name, label, error, hint, type = "text", ...rest
}: {
  name: string; label: string; error?: string; hint?: string; type?: string;
  autoComplete?: string; defaultValue?: string;
}) {
  const id = `f-${name}`;
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">{label}</label>
      <input id={id} name={name} type={type} {...rest}
             aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
             className={`w-full rounded-md border bg-transparent px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 ${error ? "border-red-500" : "border-gray-300 dark:border-gray-600"}`} />
      {error ? <p id={`${id}-err`} className="text-sm text-red-600">{error}</p>
             : hint ? <p id={`${id}-hint`} className="text-xs text-gray-500">{hint}</p> : null}
    </div>
  );
}
