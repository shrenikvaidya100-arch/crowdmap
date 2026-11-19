"use client";
// Login and sign-up form. Validates in the browser with the same rules the
// server uses, and requires the CAPTCHA before any submit (including Google).
import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
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
  const [agreed, setAgreed] = useState(false);

  // Server results arrive as new state objects; the CAPTCHA resets on each one
  // (tokens are single-use). Memoised so ordinary re-renders do NOT reset it.
  const captchaReset = useMemo(() => ({}), [state, googleState]);
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
    if (mode === "signup" && !agreed) {
      setClientErrors((p) => ({ ...p, acceptTerms: "terms.required" }));
      e.preventDefault();
      return;
    }
    if (!token) e.preventDefault();
  }

  const busy = pending || googlePending;
  const isError = message && !state.ok;

  return (
    <div className="w-full space-y-5">
      <p className="text-sm font-medium text-blue-400">CrowdMap</p>
      <h1 className="!mt-1 text-2xl font-semibold text-white">
        {t(mode === "login" ? "auth.loginTitle" : "auth.signupTitle")}
      </h1>

      {message && (
        <p role={isError ? "alert" : "status"}
           className={`rounded-md px-3 py-2 text-sm ${isError ? "bg-red-950/70 text-red-200" : "bg-green-950/70 text-green-200"}`}>
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

        {mode === "signup" && (
          <div className="space-y-1">
            <label className="flex items-start gap-2.5 text-sm text-zinc-300">
              <input type="checkbox" name="acceptTerms" checked={agreed} onChange={(e) => { setAgreed(e.target.checked); setClientErrors((p) => ({ ...p, acceptTerms: undefined })); }}
                     aria-invalid={Boolean(errors.acceptTerms)} aria-describedby={errors.acceptTerms ? "f-terms-err" : undefined}
                     className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600" />
              <span>
                {t("terms.agreeBefore")}{" "}
                <Link href="/terms" target="_blank" className="font-medium text-blue-400 underline underline-offset-2 hover:text-blue-300">{t("terms.link")}</Link>
                {t("terms.agreeAfter")}
              </span>
            </label>
            {errors.acceptTerms && <p id="f-terms-err" className="text-sm text-red-400">{t(errors.acceptTerms)}</p>}
          </div>
        )}

        <Turnstile siteKey={siteKey} lang={lang} resetSignal={captchaReset}
                   onToken={(v) => { setToken(v); if (v) setCaptchaMissing(false); }} />

        <button type="submit" disabled={busy}
                className="w-full rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-white hover:bg-blue-500 disabled:opacity-60">
          {pending ? t("auth.working") : t(mode === "login" ? "auth.loginButton" : "auth.signupButton")}
        </button>
      </form>

      <div className="flex items-center gap-3 text-xs text-zinc-500">
        <span className="h-px flex-1 bg-zinc-800" />{t("auth.or")}<span className="h-px flex-1 bg-zinc-800" />
      </div>

      <form action={googleAction} onSubmit={onGoogle}>
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="mode" value={mode} />
        {mode === "signup" && agreed && <input type="hidden" name="acceptTerms" value="on" />}
        <input type="hidden" name="cf-turnstile-response" value={token} />
        <button type="submit" disabled={busy}
                className="w-full rounded-lg border border-zinc-700 px-4 py-2.5 font-medium text-zinc-100 hover:border-zinc-500 hover:bg-zinc-900 disabled:opacity-60">
          {googlePending ? t("auth.working") : t("auth.google")}
        </button>
      </form>

      <p className="text-center text-sm text-zinc-400">
        {mode === "login" ? (
          <>{t("auth.noAccount")} <Link className="text-blue-400 hover:underline" href="/signup">{t("nav.signup")}</Link></>
        ) : (
          <>{t("auth.haveAccount")} <Link className="text-blue-400 hover:underline" href="/login">{t("nav.login")}</Link></>
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
      <label htmlFor={id} className="block text-sm font-medium text-zinc-300">{label}</label>
      <input id={id} name={name} type={type} {...rest}
             aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
             className={`w-full rounded-lg border bg-zinc-900 px-3 py-2 text-zinc-100 outline-none placeholder:text-zinc-600 focus:ring-2 focus:ring-blue-500 ${error ? "border-red-500" : "border-zinc-700"}`} />
      {error ? <p id={`${id}-err`} className="text-sm text-red-400">{error}</p>
             : hint ? <p id={`${id}-hint`} className="text-xs text-zinc-500">{hint}</p> : null}
    </div>
  );
}
