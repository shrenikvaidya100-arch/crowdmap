'use client';
// Site cursor (TargetCursor): spinning brackets that lock onto links, buttons
// and anything marked .cursor-target, with a short word under the dot.
// Elements can choose their word with data-cursor-label (or data-cursor).
// Mouse and trackpad only: touch screens keep normal taps, and text fields
// keep the normal typing cursor.
import { useSyncExternalStore } from 'react';
import TargetCursor from '@/components/core/target-cursor';

const TARGETS = '.cursor-target,a[href],button,[role="button"],[role="option"],[role="tab"],[role="switch"],select,summary,label[for]';
const TYPING = 'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="button"]):not([type="submit"]),textarea,[contenteditable="true"]';
const FINE = '(hover: hover) and (pointer: fine)';

function subscribe(cb: () => void) {
  const mq = window.matchMedia(FINE);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}

// Labels only where an element asks for one, like the snippet's data-cursor-label.
export function SiteCursor() {
  const enabled = useSyncExternalStore(subscribe, () => window.matchMedia(FINE).matches, () => false);
  if (!enabled) return null;
  return (
    <TargetCursor spinDuration={2} hideDefaultCursor parallaxOn
                  targetSelector={TARGETS} ignoreSelector={TYPING}
                  getLabel={(el) => el.getAttribute('data-cursor')} />
  );
}
