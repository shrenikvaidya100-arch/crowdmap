"use client";
// Cloudflare Turnstile CAPTCHA. Puts the token in a hidden input named
// "cf-turnstile-response" and reports it to the parent form.
import { useEffect, useRef } from "react";
import { config } from "@/lib/config";

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
declare global {
  interface Window { turnstile?: TurnstileApi }
}

let scriptPromise: Promise<void> | null = null;
function loadScript() {
  if (window.turnstile) return Promise.resolve();
  scriptPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = config.captcha.scriptUrl;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { scriptPromise = null; reject(new Error("captcha script failed")); };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export function Turnstile({
  siteKey, lang, onToken, resetSignal,
}: {
  siteKey: string;
  lang: string;
  onToken: (token: string) => void;
  /** Change this value to get a fresh token (tokens are single-use). */
  resetSignal: unknown;
}) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  useEffect(() => { onTokenRef.current = onToken; });

  useEffect(() => {
    let cancelled = false;
    loadScript().then(() => {
      if (cancelled || !box.current || !window.turnstile) return;
      widget.current = window.turnstile.render(box.current, {
        sitekey: siteKey,
        language: lang,
        theme: "auto",
        // The parent form owns the hidden token input; don't add a second one.
        "response-field": false,
        callback: (t: string) => onTokenRef.current(t),
        "expired-callback": () => onTokenRef.current(""),
        "error-callback": () => onTokenRef.current(""),
      });
    }).catch(() => onTokenRef.current(""));
    return () => {
      cancelled = true;
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
      widget.current = null;
    };
  }, [siteKey, lang]);

  useEffect(() => {
    if (widget.current && window.turnstile) {
      window.turnstile.reset(widget.current);
      onTokenRef.current("");
    }
  }, [resetSignal]);

  return <div ref={box} className="min-h-[65px]" />;
}
