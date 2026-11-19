'use client';
// A CrowdMap popup shown before the browser's own location prompt: it says why we
// want the location, with Allow / Not now. If the browser has location blocked,
// it explains how to switch it back on instead.
import { Icon } from '@/components/icons/Icon';
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

export function LocationAsk({ lang, reason, blocked, onAllow, onClose }: {
  lang: Language; reason: LocationReason; blocked: boolean; onAllow: () => void; onClose: () => void;
}) {
  const t = translator(messages, lang);
  return (
    <div className='fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-3 backdrop-blur-[2px] sm:items-center' onClick={onClose}>
      <section role='dialog' aria-modal='true' aria-labelledby='loc-title' onClick={(e) => e.stopPropagation()}
               className='w-full max-w-sm rounded-3xl bg-white p-5 text-zinc-800 shadow-2xl motion-safe:animate-[pop_200ms_ease-out] dark:bg-zinc-900 dark:text-zinc-100'>
        <span className='grid h-12 w-12 place-items-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/30'><Icon name='locate' size={22} /></span>
        <h2 id='loc-title' className='mt-4 text-lg font-semibold'>{t(blocked ? 'loc.blockedTitle' : `loc.title.${reason}`)}</h2>
        <p className='mt-1 text-sm text-zinc-600 dark:text-zinc-400'>{t(blocked ? 'loc.blockedBody' : `loc.body.${reason}`)}</p>
        {!blocked && <p className='mt-2 text-xs text-zinc-500'>{t('loc.privacy')}</p>}
        <div className={`mt-5 grid gap-2 ${blocked ? 'grid-cols-1' : 'grid-cols-2'}`}>
          <button type='button' onClick={onClose} className='rounded-xl bg-zinc-100 px-4 py-3 text-sm font-semibold hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700'>
            {t(blocked ? 'loc.ok' : 'loc.notNow')}
          </button>
          {!blocked && (
            <button type='button' autoFocus onClick={onAllow} className='rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-500'>
              {t('loc.allow')}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
