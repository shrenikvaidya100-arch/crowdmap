"use client";
// First-time welcome: pick a display name and a face (KokonutUI AvatarPicker).
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import AvatarPicker from "@/components/core/avatar-picker";
import { Icon } from "@/components/icons/Icon";
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
  const top = useRef<HTMLDivElement>(null);
  /** A picture below goes up onto the big avatar (scrolling up to it) and is marked as chosen. */
  function choose(p: string) {
    const next = picture === p ? null : p;
    setPicture(next);
    if (next) top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  return (
    <div ref={top} className="w-full max-w-sm scroll-mt-20">
      <AvatarPicker
        image={picture ? avatarImageUrl(picture) : null}
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
            <button key={p} type="button" onClick={() => choose(p)} aria-pressed={picture === p}
                    aria-label={t("welcome.picture", { n: i + 1 })}
                    className={`relative aspect-square rounded-full ring-2 transition ${picture === p ? "scale-105 ring-4 ring-blue-500 ring-offset-2 ring-offset-zinc-950" : "ring-transparent opacity-80 hover:opacity-100 hover:ring-white/30"}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={avatarImageUrl(p)} alt="" className="h-full w-full overflow-hidden rounded-full" />
              {picture === p && (
                <span aria-hidden className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-blue-600 text-white shadow ring-2 ring-zinc-950 motion-safe:animate-[pop_180ms_ease-out]">
                  <Icon name="check" size={12} />
                </span>
              )}
            </button>
          ))}
        </div>
        {picture && <p className="mt-2 text-xs text-zinc-400">{t("welcome.pictureChosen")}</p>}
      </fieldset>
      {error && <p role="alert" className="mt-3 text-center text-sm text-red-400">{error.startsWith("name.") ? tc(error) : t("welcome.error")}</p>}
    </div>
  );
}
