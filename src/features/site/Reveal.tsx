'use client';
// Rises and sharpens its children once they scroll into view; `delay` (ms)
// staggers a row of them. Instant for people who prefer reduced motion.
import { useEffect, useRef, useState, type ReactNode } from 'react';

export function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } }, { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} style={{ transitionDelay: shown ? `${delay}ms` : '0ms' }}
         className={`transition-[opacity,transform,filter] duration-700 ease-out motion-reduce:transition-none ${shown ? 'translate-y-0 opacity-100 blur-0' : 'translate-y-8 opacity-0 blur-[6px] motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:blur-0'} ${className ?? ''}`}>
      {children}
    </div>
  );
}
