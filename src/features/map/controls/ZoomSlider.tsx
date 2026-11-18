'use client';
// Vertical map zoom slider, adapted from the AdaptiveSlider reference in the
// design brief: pill track, round white thumb, dots as ticks, spring motion and
// an animated number. Blue gradient only. Synced both ways with the map:
// map zoom events set the value, and slider moves call onChange, but a value
// that came from the map is never sent back to it.
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { cn } from '@/lib/utils';

const MIN = 1;
const MAX = 20;
const STEP = 0.5;
const THUMB = 44; // px
const SPRING = { type: 'spring' as const, stiffness: 300, damping: 30 };

export function ZoomSlider({ value, onChange, labels, className }: {
  value: number;
  onChange: (zoom: number) => void;
  labels: { zoom: string; zoomIn: string; zoomOut: string; slider: string };
  className?: string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  // Track height in px (it shrinks on short screens), so the fill and thumb can spring in px.
  const [trackH, setTrackH] = useState(220);
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setTrackH(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const clamped = Math.min(MAX, Math.max(MIN, value));
  const pct = ((clamped - MIN) / (MAX - MIN)) * 100;

  const dots = useMemo(
    () => Array.from({ length: 6 }).map((_, i) => <div key={i} className='h-1.5 w-1.5 rounded-full bg-neutral-500 opacity-80' />),
    [],
  );

  const snap = (z: number) => Math.min(MAX, Math.max(MIN, Math.round(z / STEP) * STEP));

  const fromPointer = useCallback((clientY: number) => {
    const el = track.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // The fill grows from the bottom up.
    const usable = r.height - THUMB;
    const y = Math.min(Math.max(r.bottom - clientY - THUMB / 2, 0), usable);
    onChange(snap(MIN + (y / usable) * (MAX - MIN)));
  }, [onChange]);

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    fromPointer(e.clientY);
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (dragging) fromPointer(e.clientY);
  }
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const k = e.key;
    if (k === 'ArrowUp' || k === 'ArrowRight' || k === '+' || k === '=') onChange(snap(clamped + STEP));
    else if (k === 'ArrowDown' || k === 'ArrowLeft' || k === '-') onChange(snap(clamped - STEP));
    else if (k === 'PageUp') onChange(snap(clamped + 2));
    else if (k === 'PageDown') onChange(snap(clamped - 2));
    else if (k === 'Home') onChange(MIN);
    else if (k === 'End') onChange(MAX);
    else return;
    e.preventDefault();
    e.stopPropagation();
  }

  const btn = 'grid h-9 w-9 place-items-center rounded-full text-lg font-semibold text-neutral-200 hover:bg-neutral-800 active:scale-95';

  return (
    <div className={cn('flex w-14 select-none flex-col items-center gap-2 rounded-[28px] bg-neutral-900/90 px-1.5 py-2.5 shadow-2xl shadow-black/30 ring-1 ring-white/10 backdrop-blur', className)}>
      <span className='text-[10px] font-semibold uppercase tracking-wider text-neutral-500'>{labels.zoom}</span>
      <AnimatedNumber value={clamped.toFixed(1)} className='hidden text-sm font-bold text-neutral-100 tabular-nums min-[420px]:flex' />
      <button type='button' className={btn} aria-label={labels.zoomIn} onClick={() => onChange(snap(clamped + 1))}>+</button>

      <div
        ref={track}
        role='slider'
        tabIndex={0}
        aria-label={labels.slider}
        aria-orientation='vertical'
        aria-valuemin={MIN}
        aria-valuemax={MAX}
        aria-valuenow={Number(clamped.toFixed(1))}
        aria-valuetext={clamped.toFixed(1)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
        onKeyDown={onKeyDown}
        className='relative h-[clamp(88px,calc(100svh-31rem),220px)] w-11 cursor-pointer touch-none overflow-hidden rounded-full bg-neutral-800 outline-none focus-visible:ring-2 focus-visible:ring-blue-400 sm:h-[220px]'
      >
        <div className='pointer-events-none absolute inset-0 flex flex-col items-center justify-between py-4'>{dots}</div>
        <motion.div
          className='pointer-events-none absolute bottom-0 left-0 w-full rounded-full'
          style={{ background: 'linear-gradient(to top, #0B5FD6, #0894FF)' }}
          initial={false}
          animate={{ height: (pct / 100) * (trackH - THUMB) + THUMB }}
          transition={dragging ? { duration: 0 } : SPRING}
        />
        <motion.div
          className='pointer-events-none absolute left-0 flex w-full items-center justify-center'
          style={{ height: THUMB }}
          initial={false}
          animate={{ bottom: (pct / 100) * (trackH - THUMB) }}
          transition={dragging ? { duration: 0 } : SPRING}
        >
          <div className='size-9 rounded-full border-2 border-[#0894FF] bg-white shadow-[inset_0_2px_4px_rgba(0,0,0,0.06)]' />
        </motion.div>
      </div>

      <button type='button' className={btn} aria-label={labels.zoomOut} onClick={() => onChange(snap(clamped - 1))}>-</button>
    </div>
  );
}

function AnimatedNumber({ value, className }: { value: string; className?: string }) {
  return (
    <div className={cn('flex overflow-hidden will-change-transform', className)} aria-hidden>
      <AnimatePresence mode='popLayout' initial={false}>
        {value.split('').map((char, i) => (
          <motion.span
            key={char + i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0, transition: { type: 'spring', stiffness: 200, damping: 20 } }}
            exit={{ opacity: 0, y: -8 }}
          >
            {char}
          </motion.span>
        ))}
      </AnimatePresence>
    </div>
  );
}
