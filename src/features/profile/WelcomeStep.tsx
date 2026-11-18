"use client";
// First-time welcome: pick a display name and a face (KokonutUI AvatarPicker).
import { useRouter } from "next/navigation";
import { useState } from "react";
import AvatarPicker from "@/components/core/avatar-picker";
import type { Language } from "@/lib/config";
import { translator } from "@/lib/i18n";
import { common } from "@/lib/i18n/common";
import { saveAvatar } from "./actions";
import { messages } from "./messages";

export function WelcomeStep({ lang, startName, next }: { lang: Language; startName: string; next: string }) {
  const t = translator(messages, lang);
  const tc = translator(common, lang);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="w-full max-w-sm">
      <AvatarPicker
        defaultValue={{ displayName: startName, variant: 0 }}
        title={t("welcome.title")}
        description={t("welcome.body")}
        submitLabel={busy ? t("welcome.saving") : t("welcome.continue")}
        onComplete={async (v) => {
          if (busy) return;
          setBusy(true);
          setError(null);
          const r = await saveAvatar({ displayName: v.displayName, seed: v.seed });
          setBusy(false);
          if (!r.ok) return setError(r.message ?? "error");
          const sep = next.includes("?") ? "&" : "?";
          router.push(`${next}${sep}welcome=1`);
          router.refresh();
        }}
      />
      {error && <p role="alert" className="mt-3 text-center text-sm text-red-400">{error.startsWith("name.") ? tc(error) : t("welcome.error")}</p>}
    </div>
  );
}
