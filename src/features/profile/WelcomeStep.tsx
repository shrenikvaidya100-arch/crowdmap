"use client";
// First-time welcome: pick a display name and a face (KokonutUI AvatarPicker).
import { useRouter } from "next/navigation";
import { useState } from "react";
import AvatarPicker from "@/components/core/avatar-picker";
import type { Language } from "@/lib/config";
import { translator } from "@/lib/i18n";
import { common } from "@/lib/i18n/common";
import { saveAvatar } from "./actions";
import { avatarImageUrl } from "./UserAvatar";
import { messages } from "./messages";

export function WelcomeStep({ lang, startName, next }: { lang: Language; startName: string; next: string }) {
  const t = translator(messages, lang);
  const tc = translator(common, lang);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Ready-made pictures as an alternative to the coin; Shuffle deals new ones.
  // Seeds come from a counter (not Math.random) so server and browser agree.
  const [round, setRound] = useState(0);
  const pictures = ["notionists", "lorelei", "adventurer", "micah", "notionists", "lorelei", "adventurer", "micah"]
    .map((style, i) => `img:${style}:p${round}x${i}${(startName.replace(/[^a-z0-9]/gi, "").slice(0, 8) || "cm")}`);
  const [picture, setPicture] = useState<string | null>(null);
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
          const r = await saveAvatar({ displayName: v.displayName, seed: picture ?? v.seed });
          setBusy(false);
          if (!r.ok) return setError(r.message ?? "error");
          const sep = next.includes("?") ? "&" : "?";
          router.push(`${next}${sep}welcome=1`);
          router.refresh();
        }}
      />
      <fieldset className="mt-4 rounded-2xl bg-zinc-950/80 p-4 ring-1 ring-white/10">
        <legend className="sr-only">{t("welcome.pictures")}</legend>
        <div className="mb-3 flex items-center justify-between">
          <p aria-hidden className="text-sm text-zinc-300">{t("welcome.pictures")}</p>
          <button type="button" onClick={() => { setRound((r) => r + 1); setPicture(null); }}
                  className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:border-zinc-500">{t("welcome.shuffle")}</button>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {pictures.map((p, i) => (
            <button key={p} type="button" onClick={() => setPicture(picture === p ? null : p)} aria-pressed={picture === p}
                    aria-label={t("welcome.picture", { n: i + 1 })}
                    className={`aspect-square overflow-hidden rounded-full ring-2 transition ${picture === p ? "ring-blue-500" : "ring-transparent hover:ring-white/30"}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={avatarImageUrl(p)} alt="" className="h-full w-full" />
            </button>
          ))}
        </div>
        {picture && <p className="mt-2 text-xs text-zinc-400">{t("welcome.pictureChosen")}</p>}
      </fieldset>
      {error && <p role="alert" className="mt-3 text-center text-sm text-red-400">{error.startsWith("name.") ? tc(error) : t("welcome.error")}</p>}
    </div>
  );
}
