'use client';
/**
 * Pop cursor: the normal system pointer stays as it is. When it moves onto a
 * button or link, a soft highlight pops out from the pointer and wraps that
 * control (matching its rounded corners), leaning a couple of pixels toward the
 * pointer. Moving off shrinks it back into the pointer and it fades away.
 * One element, CSS transitions, no animation library.
 */
import { useEffect, useRef } from 'react';

const PAD = 4; // highlight extends this far past the control
const LEAN = 0.08; // how far the highlight follows the pointer inside the control

export default function PopCursor({ targetSelector, ignoreSelector }: { targetSelector: string; ignoreSelector?: string }) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let target: Element | null = null;
    let mx = 0;
    let my = 0;

    const place = () => {
      if (!target || !target.isConnected) { hide(); return; }
      const r = target.getBoundingClientRect();
      if (r.width === 0 || r.width > 480 || r.height > 160) { hide(); return; } // skip big cards and hidden items
      const dx = (mx - (r.left + r.width / 2)) * LEAN;
      const dy = (my - (r.top + r.height / 2)) * LEAN;
      const radius = parseFloat(getComputedStyle(target).borderTopLeftRadius) || 10;
      el.style.width = `${r.width + PAD * 2}px`;
      el.style.height = `${r.height + PAD * 2}px`;
      el.style.borderRadius = `${Math.min(radius + PAD, (r.height + PAD * 2) / 2)}px`;
      el.style.transform = `translate(${r.left - PAD + dx}px, ${r.top - PAD + dy}px) scale(1)`;
      el.style.opacity = '1';
    };
    const hide = () => {
      target = null;
      el.style.transform = `translate(${mx - 4}px, ${my - 4}px) scale(0.2)`;
      el.style.width = '8px';
      el.style.height = '8px';
      el.style.opacity = '0';
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      mx = e.clientX;
      my = e.clientY;
      const hit = e.target instanceof Element ? e.target : null;
      const next = hit && !(ignoreSelector && hit.closest(ignoreSelector)) ? hit.closest(targetSelector) : null;
      if (next !== target) {
        if (!target && next) {
          // Pop out from the pointer: start small at the pointer with no transition.
          el.style.transition = 'none';
          el.style.transform = `translate(${mx - 4}px, ${my - 4}px) scale(0.2)`;
          void el.offsetWidth;
          el.style.transition = '';
        }
        target = next;
      }
      if (target) place(); else if (el.style.opacity !== '0') hide();
    };
    const onScroll = () => { if (target) place(); };
    const onLeave = () => hide();

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    window.addEventListener('pointerdown', onScroll);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('scroll', onScroll, { capture: true });
      document.documentElement.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('pointerdown', onScroll);
    };
  }, [targetSelector, ignoreSelector]);

  return (
    <div ref={box} aria-hidden
         className='pointer-events-none fixed left-0 top-0 z-[9999] h-2 w-2 bg-sky-400/15 opacity-0 ring-1 ring-sky-300/40 shadow-[0_0_24px_rgba(56,189,248,0.25)] will-change-transform [transition:transform_.22s_cubic-bezier(.2,.9,.3,1.2),width_.22s_cubic-bezier(.2,.9,.3,1.2),height_.22s_cubic-bezier(.2,.9,.3,1.2),border-radius_.22s,opacity_.18s] motion-reduce:transition-none' />
  );
}
