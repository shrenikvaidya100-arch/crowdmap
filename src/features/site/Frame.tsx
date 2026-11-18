// Framed panel with corner marks and a small mono section label, after the
// Watermelon UI landing template's technical look (no icons, no bento grid).
import type { ReactNode } from "react";

export function Frame({ children, className = "" }: { children: ReactNode; className?: string }) {
  const c = "pointer-events-none absolute h-2 w-2 border-white/40";
  return (
    <div className={`relative border border-white/10 bg-black/40 backdrop-blur-sm ${className}`}>
      <span aria-hidden className={`${c} left-0 top-0 border-l border-t`} />
      <span aria-hidden className={`${c} right-0 top-0 border-r border-t`} />
      <span aria-hidden className={`${c} bottom-0 left-0 border-b border-l`} />
      <span aria-hidden className={`${c} bottom-0 right-0 border-b border-r`} />
      {children}
    </div>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="mb-5 inline-flex items-center font-mono text-xs font-semibold uppercase tracking-[0.2em] text-[#0894FF]">
      <span aria-hidden className="mr-3 opacity-70">{"//"}</span>{children}
    </p>
  );
}

/** Faint dotted grid behind a section. */
export function DotGrid() {
  return <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:24px_24px]" />;
}
