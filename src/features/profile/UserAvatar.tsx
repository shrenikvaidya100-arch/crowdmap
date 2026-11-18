"use client";
// The user's face, drawn from their saved avatar seed (KokonutUI AvatarPicker's
// generator). Nothing but the seed is stored. Falls back to initials.
import { useMemo } from "react";
import { createFace, FaceArt } from "@/components/core/avatar-picker";

export function UserAvatar({ seed, name, size = 32, className = "" }: { seed: string | null; name: string; size?: number; className?: string }) {
  const face = useMemo(() => (seed ? createFace(seed) : null), [seed]);
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
  return (
    <span aria-hidden className={`inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-zinc-700 text-[11px] font-semibold text-white ${className}`}
          style={{ width: size, height: size }}>
      {face ? <FaceArt face={face} className="h-full w-full" /> : initials}
    </span>
  );
}
