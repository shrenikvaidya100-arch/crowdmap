'use client';
// Asks a signed-in person to turn on notifications when they're off on this device
// (or explains how to unblock them), in the same style as the location popup.
import { useState } from 'react';
import { Icon } from '@/components/icons/Icon';
import type { Language } from '@/lib/config';
import { translator } from '@/lib/i18n';
import { enablePush } from './push';
import { messages } from './messages';

export function NotifyAsk({ lang, blocked, onClose }: { lang: Language; blocked: boolean; onClose: () => void }) {
  const t = translator(messages, lang);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  async function turnOn() {
    setBusy(true);
    const r = await enablePush();
    setBusy(false);
    if (r === 'on') onClose();
    else setFailed(true);
  }
  return (
    <div className='fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-3 backdrop-blur-[2px] sm:items-center' onClick={onClose}>
      <section role='dialog' aria-modal='true' aria-labelledby='notify-title' onClick={(e) => e.stopPropagation()}
               className='w-full max-w-sm rounded-3xl bg-white p-5 text-zinc-800 shadow-2xl motion-safe:animate-[pop_200ms_ease-out] dark:bg-zinc-900 dark:text-zinc-100'>
        <span className='grid h-12 w-12 place-items-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/30'><Icon name='bell' size={22} /></span>
        <h2 id='notify-title' className='mt-4 text-lg font-semibold'>{t(blocked ? 'ask.blockedTitle' : 'ask.title')}</h2>
        <p className='mt-1 text-sm text-zinc-600 dark:text-zinc-400'>{t(blocked ? 'ask.blockedBody' : 'ask.body')}</p>
        {failed && <p role='alert' className='mt-2 text-sm text-red-600'>{t('ask.failed')}</p>}
        {blocked ? (
          <button type='button' autoFocus onClick={onClose} className='mt-5 w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-500'>
            {t('ask.ok')}
          </button>
        ) : (
          <div className='mt-5 grid grid-cols-2 gap-2'>
            <button type='button' onClick={onClose}
                    className='rounded-xl bg-zinc-100 px-4 py-3 text-sm font-semibold hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700'>{t('ask.notNow')}</button>
            <button type='button' autoFocus disabled={busy} onClick={turnOn}
                    className='rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60'>{t('ask.on')}</button>
          </div>
        )}
      </section>
    </div>
  );
}
