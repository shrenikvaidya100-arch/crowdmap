'use client';
// Site cursor: the normal pointer, plus a soft highlight that pops onto
// buttons and links under it and shrinks back into the pointer when it moves
// off. Mouse and trackpad only; touch screens keep normal taps.
import { useSyncExternalStore } from 'react';
import PopCursor from '@/components/core/pop-cursor';

const TARGETS = 'a[href],button,[role="button"],[role="option"],[role="tab"],[role="switch"],[role="menuitem"],select,summary,label[for]';
const TYPING = 'input,textarea,[contenteditable="true"],.maplibregl-canvas';
const FINE = '(hover: hover) and (pointer: fine)';

function subscribe(cb: () => void) {
  const mq = window.matchMedia(FINE);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}

export function SiteCursor() {
  const enabled = useSyncExternalStore(subscribe, () => window.matchMedia(FINE).matches, () => false);
  if (!enabled) return null;
  return <PopCursor targetSelector={TARGETS} ignoreSelector={TYPING} />;
}
