"use client";
// Watermelon UI "GlowingBorderCard" (from stats-4, registry.watermelon.sh, MIT):
// a card whose border lights up under the pointer, over a faint striped pattern.
// Trimmed to the card itself; colours are passed in.
import { useRef, useState, type MouseEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function GlowCard({ children, className, glowColor, stripe }: {
  children: ReactNode; className?: string;
  /** e.g. "rgba(59,130,246,0.8)" */
  glowColor: string;
  /** e.g. "rgba(59,130,246,0.15)" */
  stripe: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [on, setOn] = useState(false);
  const move = (e: MouseEvent<HTMLDivElement>) => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setPos({ x: e.clientX - r.left, y: e.clientY - r.top });
  };
  return (
    <div ref={ref} onMouseMove={move} onMouseEnter={() => setOn(true)} onMouseLeave={() => setOn(false)}
         className={cn("relative rounded-2xl bg-zinc-200/70 p-[1.5px] dark:bg-zinc-800", className)}>
      <div aria-hidden className="pointer-events-none absolute inset-0 rounded-2xl transition-opacity duration-300"
           style={{ opacity: on ? 1 : 0, background: `radial-gradient(420px circle at ${pos.x}px ${pos.y}px, ${glowColor}, transparent 40%)` }} />
      <div className="relative z-10 h-full overflow-hidden rounded-2xl bg-white dark:bg-zinc-950">
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-40 dark:opacity-60"
             style={{ background: `repeating-linear-gradient(45deg, ${stripe}, ${stripe} 12px, transparent 12px, transparent 24px)` }} />
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent to-white/90 dark:to-zinc-950/90" />
        <div className="relative z-20 flex h-full flex-col justify-between p-5">{children}</div>
      </div>
    </div>
  );
}
