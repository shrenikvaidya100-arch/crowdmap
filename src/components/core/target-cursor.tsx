'use client';
/**
 * Target cursor: a dot with four corner brackets that slowly spin around it.
 * Over a target (any `.cursor-target`, or whatever `targetSelector` matches)
 * the brackets stop spinning and lock onto the target's corners, and an
 * optional label (`data-cursor-label`) shows under the dot. With `parallaxOn`
 * the locked brackets lean a little toward the pointer.
 * Written for CrowdMap with no animation library: one rAF loop moves the DOM.
 */
import { useEffect, useRef } from 'react';

export interface TargetCursorProps {
  /** Seconds per full turn while idle. */
  spinDuration?: number;
  /** Hide the system pointer (text fields keep the typing cursor). */
  hideDefaultCursor?: boolean;
  /** Locked brackets lean toward the pointer. */
  parallaxOn?: boolean;
  targetSelector?: string;
  /** Label for a target with no data-cursor-label of its own. */
  getLabel?: (target: Element) => string | null;
  /** Elements that turn the cursor off (text fields). */
  ignoreSelector?: string;
}

const CORNER = 12; // bracket arm length, px
const IDLE_GAP = 11; // distance of brackets from the dot when idle
const PAD = 6; // space between a locked bracket and the target

export default function TargetCursor({
  spinDuration = 2,
  hideDefaultCursor = true,
  parallaxOn = true,
  targetSelector = '.cursor-target',
  getLabel,
  ignoreSelector,
}: TargetCursorProps) {
  const root = useRef<HTMLDivElement>(null);
  const dot = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLDivElement>(null);
  const corners = useRef<(HTMLDivElement | null)[]>([]);
  const opts = useRef({ spinDuration, parallaxOn, targetSelector, getLabel, ignoreSelector });
  useEffect(() => { opts.current = { spinDuration, parallaxOn, targetSelector, getLabel, ignoreSelector }; });

  useEffect(() => {
    if (hideDefaultCursor) document.documentElement.classList.add('custom-cursor');
    const mouse = { x: -100, y: -100 };
    const pos = { x: -100, y: -100 };
    // Current bracket offsets from the dot, eased toward their goal each frame.
    const cur = [0, 1, 2, 3].map(() => ({ x: 0, y: 0 }));
    let target: Element | null = null;
    let hidden = false;
    let angle = 0;
    let last = performance.now();
    let raf = 0;

    const onMove = (e: MouseEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      const el = e.target instanceof Element ? e.target : null;
      const o = opts.current;
      hidden = !!(o.ignoreSelector && el?.closest(o.ignoreSelector));
      const t = el?.closest(o.targetSelector) ?? null;
      if (t !== target) {
        target = t;
        const text = t ? t.getAttribute('data-cursor-label') ?? o.getLabel?.(t) ?? null : null;
        if (label.current) {
          label.current.textContent = text ?? '';
          label.current.style.opacity = text ? '1' : '0';
        }
      }
    };
    const onLeave = () => { hidden = true; };
    const onDown = () => dot.current?.style.setProperty('scale', '0.6');
    const onUp = () => dot.current?.style.setProperty('scale', '1');

    const frame = (now: number) => {
      const dt = Math.min(now - last, 50);
      last = now;
      pos.x += (mouse.x - pos.x) * Math.min(1, dt / 40);
      pos.y += (mouse.y - pos.y) * Math.min(1, dt / 40);
      const o = opts.current;
      let goals: { x: number; y: number }[];
      // A target that scrolled away or left the page no longer counts.
      if (target && !target.isConnected) target = null;
      if (target) {
        const r = target.getBoundingClientRect();
        const lean = o.parallaxOn ? 0.08 : 0;
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const lx = (mouse.x - cx) * lean, ly = (mouse.y - cy) * lean;
        const box = [
          { x: r.left - PAD, y: r.top - PAD },
          { x: r.right + PAD - CORNER, y: r.top - PAD },
          { x: r.right + PAD - CORNER, y: r.bottom + PAD - CORNER },
          { x: r.left - PAD, y: r.bottom + PAD - CORNER },
        ];
        goals = box.map((b) => ({ x: b.x + lx - pos.x, y: b.y + ly - pos.y }));
        angle = 0;
      } else {
        angle += (dt / (o.spinDuration * 1000)) * Math.PI * 2;
        goals = [0, 1, 2, 3].map((i) => {
          const a = angle + (i * Math.PI) / 2 - (3 * Math.PI) / 4;
          const d = IDLE_GAP * Math.SQRT2;
          return { x: Math.cos(a) * d - CORNER / 2, y: Math.sin(a) * d - CORNER / 2 };
        });
      }
      const k = Math.min(1, dt / (target ? 60 : 30));
      cur.forEach((c, i) => {
        c.x += (goals[i].x - c.x) * k;
        c.y += (goals[i].y - c.y) * k;
        const el = corners.current[i];
        if (el) el.style.transform = `translate(${c.x}px, ${c.y}px)`;
      });
      if (root.current) {
        root.current.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
        root.current.style.opacity = hidden ? '0' : '1';
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    document.addEventListener('mousemove', onMove, { passive: true });
    document.documentElement.addEventListener('mouseleave', onLeave);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('mouseup', onUp);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('mousemove', onMove);
      document.documentElement.removeEventListener('mouseleave', onLeave);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('mouseup', onUp);
      document.documentElement.classList.remove('custom-cursor');
    };
  }, [hideDefaultCursor]);

  // Each bracket is an L: two borders of a small square.
  const sides = ['border-l-2 border-t-2', 'border-r-2 border-t-2', 'border-b-2 border-r-2', 'border-b-2 border-l-2'];
  return (
    <div ref={root} aria-hidden className='pointer-events-none fixed left-0 top-0 z-[100] opacity-0 mix-blend-difference transition-opacity duration-150'>
      <div ref={dot} className='absolute -left-[3px] -top-[3px] h-1.5 w-1.5 rounded-full bg-white transition-[scale] duration-150' />
      {sides.map((s, i) => (
        <div key={i} ref={(el) => { corners.current[i] = el; }} className={`absolute left-0 top-0 h-3 w-3 border-white ${s}`} />
      ))}
      <div ref={label} className='absolute left-3 top-4 whitespace-nowrap rounded-md bg-white px-1.5 py-0.5 text-[11px] font-medium text-black opacity-0 transition-opacity duration-150' />
    </div>
  );
}
