'use client';
// Custom cursor (Motion Primitives Cursor): a small dot that grows into a pill
// with a word when it is over something useful:
//   links and buttons: "Open", the search box: "Search", the map: "Explore".
// Elements can choose their own word with data-cursor="...".
// Mouse and trackpad only: touch screens keep normal taps, and text fields keep
// the normal typing cursor.
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { Cursor } from '@/components/core/cursor';

const CLICKABLE = 'a[href],button,[role="button"],[role="option"],[role="tab"],select,summary,label[for]';
const TYPING = 'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="button"]):not([type="submit"]),textarea,[contenteditable="true"]';

function labelFor(target: Element | null, words: { open: string; explore: string }) {
  if (!target) return null;
  const custom = target.closest('[data-cursor]');
  if (custom) return custom.getAttribute('data-cursor');
  if (target.closest('.maplibregl-canvas')) return words.explore;
  if (target.closest(CLICKABLE)) return words.open;
  return null;
}

export function SiteCursor({ words }: { words: { open: string; explore: string } }) {
  const [enabled, setEnabled] = useState(false);
  const [label, setLabel] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const [inside, setInside] = useState(true);

  // Only for a real mouse or trackpad.
  useEffect(() => {
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)');
    const apply = () => setEnabled(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    document.documentElement.classList.add('custom-cursor');
    const onMove = (e: MouseEvent) => {
      const el = e.target instanceof Element ? e.target : null;
      const l = labelFor(el, words);
      setLabel((prev) => (prev === l ? prev : l));
      const t = !!el?.closest(TYPING);
      setTyping((prev) => (prev === t ? prev : t));
      setInside(true);
    };
    const onLeave = () => setInside(false);
    document.addEventListener('mousemove', onMove, { passive: true });
    document.documentElement.addEventListener('mouseleave', onLeave);
    return () => {
      document.documentElement.classList.remove('custom-cursor');
      document.removeEventListener('mousemove', onMove);
      document.documentElement.removeEventListener('mouseleave', onLeave);
      document.body.style.cursor = '';
    };
  }, [enabled, words]);

  if (!enabled) return null;
  const hovering = !!label;
  const width = label ? Math.max(64, label.length * 8 + 28) : 16;

  return (
    <Cursor
      className='z-[100]'
      springConfig={{ bounce: 0.001 }}
      variants={{
        initial: { scale: 0.3, opacity: 0 },
        animate: { scale: 1, opacity: 1 },
        exit: { scale: 0.3, opacity: 0 },
      }}
      transition={{ ease: 'easeInOut', duration: 0.15 }}
    >
      <motion.div
        animate={{
          width: hovering ? width : typing ? 0 : 16,
          height: hovering ? 32 : typing ? 0 : 16,
          opacity: inside ? 1 : 0,
        }}
        transition={{ type: 'spring', bounce: 0.15, duration: 0.3 }}
        className='flex items-center justify-center rounded-[24px] bg-zinc-900/70 ring-1 ring-white/25 backdrop-blur-md'
      >
        <AnimatePresence>
          {hovering ? (
            <motion.div
              key={label}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              className='inline-flex w-full items-center justify-center'
            >
              <div className='inline-flex items-center whitespace-nowrap text-sm font-medium text-white'>{label}</div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.div>
    </Cursor>
  );
}
