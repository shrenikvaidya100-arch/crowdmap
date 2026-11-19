'use client';
// The site's own "Are you sure?" popup, used instead of the browser's confirm()
// (which looks out of place and is clumsy on phones). Call askConfirm(message)
// anywhere; <ConfirmHost /> in the root layout shows it. Esc or a tap outside cancels.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

type Ask = { message: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean; resolve: (ok: boolean) => void };
let current: Ask | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Shows the popup and resolves true (confirmed) or false (cancelled). */
export function askConfirm(message: string, opts: { confirmLabel?: string; cancelLabel?: string; danger?: boolean } = {}): Promise<boolean> {
  current?.resolve(false);
  return new Promise((resolve) => {
    current = { message, danger: true, ...opts, resolve };
    emit();
  });
}

function close(ok: boolean) {
  const a = current;
  current = null;
  emit();
  a?.resolve(ok);
}

export function ConfirmHost() {
  const ask = useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => current, () => null);
  const [hi] = useState(() => typeof document !== 'undefined' && document.documentElement.lang === 'hi');
  const okRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!ask) return;
    okRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ask]);
  if (!ask) return null;
  return (
    <div className='fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-3 backdrop-blur-[2px] sm:items-center' onClick={() => close(false)}>
      <section role='alertdialog' aria-modal='true' aria-labelledby='confirm-msg' onClick={(e) => e.stopPropagation()}
               className='w-full max-w-sm rounded-3xl bg-white p-5 text-zinc-900 shadow-2xl motion-safe:animate-[sheetup_200ms_ease-out] sm:motion-safe:animate-[pop_160ms_ease-out] dark:bg-zinc-900 dark:text-zinc-100'>
        <p id='confirm-msg' className='text-base font-medium leading-snug'>{ask.message}</p>
        <div className='mt-5 grid grid-cols-2 gap-2'>
          <button type='button' onClick={() => close(false)}
                  className='min-h-11 rounded-xl bg-zinc-100 px-4 text-sm font-semibold hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700'>
            {ask.cancelLabel ?? (hi ? 'रद्द करें' : 'Cancel')}
          </button>
          <button ref={okRef} type='button' onClick={() => close(true)}
                  className={`min-h-11 rounded-xl px-4 text-sm font-semibold text-white ${ask.danger ? 'bg-red-600 hover:bg-red-500' : 'bg-blue-600 hover:bg-blue-500'}`}>
            {ask.confirmLabel ?? (hi ? 'हाँ' : 'Yes')}
          </button>
        </div>
      </section>
    </div>
  );
}
