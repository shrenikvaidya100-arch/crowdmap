'use client';
// Motion for the info pages (About, What's New, Getting Started, Contact):
// a card that lights up under the pointer, a timeline line that draws itself as
// you scroll, and the hero's drifting glow with pulsing crowd dots.
// Everything settles to a still page for people who prefer reduced motion.
import { motion, useScroll, useSpring } from 'motion/react';
import { useRef, type PointerEvent, type ReactNode } from 'react';

/** A card with a soft light that follows the pointer. */
export function Spotlight({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--x', `${e.clientX - r.left}px`);
    el.style.setProperty('--y', `${e.clientY - r.top}px`);
  };
  return (
    <div ref={ref} onPointerMove={move}
         className={`group relative overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/70 transition-[border-color,transform] duration-300 hover:-translate-y-0.5 hover:border-white/20 motion-reduce:hover:translate-y-0 ${className}`}>
      <div aria-hidden className='pointer-events-none absolute -inset-px opacity-0 transition-opacity duration-300 group-hover:opacity-100'
           style={{ background: 'radial-gradient(420px circle at var(--x, 50%) var(--y, 0%), rgba(8,148,255,0.16), transparent 60%)' }} />
      <div className='relative'>{children}</div>
    </div>
  );
}

/** A vertical line beside a list that fills in as the list scrolls past. */
export function ScrollLine({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 75%', 'end 60%'] });
  const scaleY = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.4 });
  return (
    <div ref={ref} className={`relative ${className}`}>
      <div aria-hidden className='absolute bottom-0 left-[15px] top-0 w-px bg-white/10' />
      <motion.div aria-hidden style={{ scaleY }}
                  className='absolute bottom-0 left-[15px] top-0 w-px origin-top bg-gradient-to-b from-[#0894FF] via-[#5ad1ff] to-[#21c55d]' />
      {children}
    </div>
  );
}

// Fixed positions so the server and the browser draw the same dots.
const COLORS = ['#22c55e', '#84cc16', '#eab308', '#f97316', '#ef4444'];
const DOTS = Array.from({ length: 26 }, (_, i) => {
  const r = (n: number) => ((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;
  return { left: `${(r(1) * 96 + 2).toFixed(2)}%`, top: `${(r(2) * 80 + 8).toFixed(2)}%`, color: COLORS[Math.floor(r(3) * 5)], delay: `${(r(4) * 4).toFixed(2)}s`, size: 4 + Math.round(r(5) * 4) };
});

/** The hero background: two drifting glows and crowd-coloured dots that pulse like live reports. */
export function HeroBackdrop() {
  return (
    <div aria-hidden className='pointer-events-none absolute inset-0 -z-10 overflow-hidden'>
      <div className='absolute -left-32 -top-40 h-[34rem] w-[34rem] rounded-full bg-[#0894FF]/25 blur-[110px] motion-safe:animate-[drift_18s_ease-in-out_infinite]' />
      <div className='absolute -right-40 top-10 h-[28rem] w-[28rem] rounded-full bg-emerald-500/15 blur-[110px] motion-safe:animate-[drift_22s_ease-in-out_infinite_reverse]' />
      <div className='absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:26px_26px] [mask-image:linear-gradient(to_bottom,black,transparent)]' />
      {DOTS.map((d, i) => (
        <span key={i} className='absolute' style={{ left: d.left, top: d.top }}>
          <span className='absolute rounded-full opacity-60 motion-safe:animate-[ping_3s_cubic-bezier(0,0,0.2,1)_infinite]'
                style={{ width: d.size * 2.5, height: d.size * 2.5, left: -d.size * 0.75, top: -d.size * 0.75, background: d.color, animationDelay: d.delay }} />
          <span className='relative block rounded-full' style={{ width: d.size, height: d.size, background: d.color, boxShadow: `0 0 12px ${d.color}` }} />
        </span>
      ))}
      <div className='absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-black' />
    </div>
  );
}
