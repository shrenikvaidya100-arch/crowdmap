'use client';
// The admin check form: a code picture, a box to type it, Enter to go in.
// Every wrong answer (and "New code") loads a fresh picture.
import { useActionState, useEffect, useRef, useState } from 'react';
import { unlockAdmin, type GateState } from './gateActions';

export function AdminGateForm({ labels }: {
  labels: { title: string; body: string; field: string; enter: string; refresh: string; wrong: string; expired: string; empty: string; note: string; image: string };
}) {
  const [state, action, pending] = useActionState<GateState, FormData>(unlockAdmin, null);
  const [n, setN] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  // A wrong or expired answer used the code up: show a new one and clear the box.
  useEffect(() => {
    if (state?.error === 'wrong' || state?.error === 'expired') {
      queueMicrotask(() => setN((x) => x + 1));
      if (input.current) input.current.value = '';
    }
    input.current?.focus();
  }, [state]);
  const err = state?.error ? labels[state.error] : '';
  return (
    <form action={action} className='w-full max-w-sm border border-zinc-900 bg-white p-6 shadow-[6px_6px_0_#18181b]'>
      <p className='font-mono text-[11px] uppercase tracking-[0.25em] text-zinc-500'>CrowdMap / admin</p>
      <h1 className='mt-2 font-serif text-2xl font-semibold'>{labels.title}</h1>
      <p className='mt-1 text-sm text-zinc-600'>{labels.body}</p>
      <div className='mt-5 flex items-center gap-3'>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img key={n} src={`/admin-check/code?n=${n}`} alt={labels.image} width={260} height={84}
             className='h-[84px] w-[260px] max-w-full border border-zinc-300 bg-[#f5f1e8]' />
      </div>
      <button type='button' onClick={() => { setN((x) => x + 1); input.current?.focus(); }}
              className='mt-1 text-xs text-zinc-600 underline underline-offset-2 hover:text-zinc-900'>{labels.refresh}</button>
      <label className='mt-4 block text-sm font-medium' htmlFor='admin-code'>{labels.field}</label>
      <div className='mt-1 flex gap-2'>
        <input ref={input} id='admin-code' name='code' autoComplete='off' autoCapitalize='characters' spellCheck={false} autoFocus
               maxLength={12} aria-invalid={!!err} aria-describedby={err ? 'admin-code-error' : undefined}
               className='min-w-0 flex-1 border border-zinc-900 px-3 py-2 font-mono text-lg uppercase tracking-[0.3em] outline-none focus:bg-yellow-50 focus:ring-2 focus:ring-zinc-900' />
        <button type='submit' disabled={pending}
                className='border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-60'>
          {pending ? '…' : labels.enter} <span aria-hidden>↵</span>
        </button>
      </div>
      <p id='admin-code-error' role='alert' className='mt-2 min-h-5 text-sm text-red-700'>{err}</p>
      <p className='mt-3 border-t border-dashed border-zinc-300 pt-3 text-xs text-zinc-500'>{labels.note}</p>
    </form>
  );
}
