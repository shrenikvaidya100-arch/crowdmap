'use client';
// A thin bar across the top of the screen while something is still loading. It
// only appears once loading has taken more than 3 seconds, so quick loads stay calm.
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

export const SLOW_MS = 3000;

export function LoadingBar({ busy, label = 'Loading' }: { busy: boolean; label?: string }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!busy) { queueMicrotask(() => setSlow(false)); return; }
    const id = setTimeout(() => setSlow(true), SLOW_MS);
    return () => clearTimeout(id);
  }, [busy]);
  if (!busy || !slow) return null;
  return (
    <div role='progressbar' aria-label={label} aria-busy='true'
         className='pointer-events-none fixed inset-x-0 top-0 z-[60] h-1 overflow-hidden bg-blue-600/15 print:hidden'>
      <div className='h-full w-1/3 rounded-full bg-gradient-to-r from-blue-500 via-sky-400 to-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.8)] motion-safe:animate-[loadbar_1.1s_ease-in-out_infinite]' />
    </div>
  );
}

/** Page changes: busy from a click on an internal link until the new page shows. */
export function NavProgress() {
  const path = usePathname();
  const [pendingFrom, setPendingFrom] = useState<string | null>(null);
  // The new page is on screen: done.
  if (pendingFrom !== null && pendingFrom !== path) setPendingFrom(null);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname === location.pathname) return;
      setPendingFrom(location.pathname);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);
  return <LoadingBar busy={pendingFrom !== null} />;
}
