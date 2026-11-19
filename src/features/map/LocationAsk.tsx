'use client';
// A CrowdMap popup shown before the browser's own location prompt: it says why we
// want the location, with Allow / Not now. If the browser has location blocked,
// it explains how to switch it back on instead.
import { useEffect, useState } from 'react';
import { Icon } from '@/components/icons/Icon';
import { enablePush, pushStatus } from '@/features/alerts/push';
import type { Language } from '@/lib/config';
import { translator } from '@/lib/i18n';
import { messages } from './messages';

export type LocationReason = 'share' | 'locate' | 'route';

/** Asks the browser what it would do, without prompting. */
export async function locationPermission(): Promise<PermissionState | 'unknown'> {
  try {
    if (!navigator.permissions) return 'unknown';
    return (await navigator.permissions.query({ name: 'geolocation' as PermissionName })).state;
  } catch { return 'unknown'; }
}

export function LocationAsk({ lang, reason, blocked, off = false, onAllow, onClose, signedIn = false }: {
  lang: Language; reason: LocationReason; blocked: boolean; onAllow: () => void; onClose: () => void;
  /** The phone's location services are off (rather than this site being blocked). */
  off?: boolean;
  /** Signed-in people can switch on notifications in the same popup. */
  signedIn?: boolean;
}) {
  const t = translator(messages, lang);
  // Location and notifications together: offer notifications when they aren't on yet.
  const [canPush, setCanPush] = useState(false);
  const [wantPush, setWantPush] = useState(true);
  useEffect(() => {
    if (!signedIn) return;
    void pushStatus().then((s) => setCanPush(s === 'off'));
  }, [signedIn]);
  function allow() {
    onAllow();
    if (canPush && wantPush) void enablePush();
  }
  return (
    <div className='fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-3 backdrop-blur-[2px] sm:items-center' onClick={onClose}>
      <section role='dialog' aria-modal='true' aria-labelledby='loc-title' onClick={(e) => e.stopPropagation()}
               className='w-full max-w-sm rounded-3xl bg-white p-5 text-zinc-800 shadow-2xl motion-safe:animate-[pop_200ms_ease-out] dark:bg-zinc-900 dark:text-zinc-100'>
        <span className='grid h-12 w-12 place-items-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/30'><Icon name='locate' size={22} /></span>
        <h2 id='loc-title' className='mt-4 text-lg font-semibold'>{t(off ? 'loc.offTitle' : blocked ? 'loc.blockedTitle' : `loc.title.${reason}`)}</h2>
        <p className='mt-1 text-sm text-zinc-600 dark:text-zinc-400'>{t(off ? 'loc.offBody' : blocked ? 'loc.blockedBody' : `loc.body.${reason}`)}</p>
        {blocked && !off && <p className='mt-2 text-xs text-zinc-500'>{t('loc.blockedPhone')}</p>}
        {!blocked && <p className='mt-2 text-xs text-zinc-500'>{t('loc.privacy')}</p>}
        {canPush && (
          <label className='mt-3 flex items-start gap-2.5 rounded-xl bg-zinc-50 p-3 text-sm dark:bg-zinc-800/60'>
            <input type='checkbox' checked={wantPush} onChange={(e) => setWantPush(e.target.checked)} className='mt-0.5 h-4 w-4 accent-blue-600' />
            <span><span className='font-medium'>{t('loc.push')}</span><span className='block text-xs text-zinc-500'>{t('loc.pushHint')}</span></span>
          </label>
        )}
        <div className='mt-5 grid grid-cols-2 gap-2'>
          <button type='button' onClick={() => { if (blocked && canPush && wantPush) void enablePush(); onClose(); }}
                  className='rounded-xl bg-zinc-100 px-4 py-3 text-sm font-semibold hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700'>
            {t('loc.notNow')}
          </button>
          {/* Blocked: "Try again" asks for the location again once it's been switched on. */}
          <button type='button' autoFocus onClick={allow} className='rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-500'>
            {t(blocked ? 'loc.retry' : 'loc.allow')}
          </button>
        </div>
      </section>
    </div>
  );
}
