"use client";
// The user's face, drawn from their saved avatar seed (KokonutUI AvatarPicker's
// generator). Nothing but the seed is stored. Falls back to initials.
import { useMemo } from "react";
import { createFace, FaceArt } from "@/components/core/avatar-picker";

/** Picture avatars are saved as "img:<style>:<seed>" and drawn by DiceBear (free, no key). */
export function avatarImageUrl(seed: string) {
  const [, style, key] = seed.split(":");
  return `https://api.dicebear.com/9.x/${encodeURIComponent(style)}/svg?seed=${encodeURIComponent(key ?? "")}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;
}
export const isImageSeed = (seed: string | null) => !!seed && /^img:[a-z-]+:[\w-]{3,40}$/.test(seed);

export function UserAvatar({ seed, name, size = 32, className = "" }: { seed: string | null; name: string; size?: number; className?: string }) {
  const face = useMemo(() => (seed && !isImageSeed(seed) ? createFace(seed) : null), [seed]);
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
  return (
    <span aria-hidden className={`inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-zinc-700 text-[11px] font-semibold text-white ${className}`}
          style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {isImageSeed(seed) ? <img src={avatarImageUrl(seed!)} alt="" className="h-full w-full object-cover" />
        : face ? <FaceArt face={face} className="h-full w-full" /> : initials}
    </span>
  );
}
