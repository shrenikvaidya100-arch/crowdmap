'use client';
// "Go" panel: the route to a place or pin, drawn on the map by MapView. Shows
// the time and distance by car or on foot, follows you along the way, hands off
// to Google Maps for spoken turn-by-turn, and books an Uber to the spot.
import { useState, type ReactNode } from 'react';
import { Icon } from '@/components/icons/Icon';
import { config, type Language } from '@/lib/config';
import { translator } from '@/lib/i18n';
import { messages } from './messages';

export type GoMode = 'drive' | 'walk';
export type GoDest = { lat: number; lng: number; name: string };
export type GoStatus = 'locating' | 'routing' | 'ready' | 'noLocation' | 'error';

const fmtDist = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`);
const fmtTime = (s: number, t: ReturnType<typeof translator>) => {
  const m = Math.max(1, Math.round(s / 60));
  return m < 60 ? t('go.min', { n: m }) : t('go.hours', { h: Math.floor(m / 60), m: m % 60 });
};

/** Directions, Uber and Google Maps buttons, for the place card and pins. */
export function GoButtons({ dest, from, lang, onGo, tone = 'dark' }: {
  dest: GoDest; from?: { lat: number; lng: number } | null; lang: Language; onGo: () => void; tone?: 'dark' | 'light';
}) {
  const t = translator(messages, lang);
  return (
    <div className='flex gap-2'>
      <button type='button' onClick={onGo}
              className='flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-2.5 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 active:scale-[0.98]'>
        <Icon name='compass' size={15} />{t('go.directions')}
      </button>
      <UberButton dest={dest} from={from} title={t('go.uberTitle')}
                  className='flex items-center justify-center rounded-lg bg-black px-3.5 py-2 text-white ring-1 ring-white/20 hover:bg-zinc-800'>
        <span className='sr-only'>{t('go.uberTitle')}</span>
      </UberButton>
    </div>
  );
}

/**
 * Opens Uber with the pickup (your location) and drop-off filled in. A little car
 * drives across the button first. The tab opens straight away (so pop-up blockers
 * allow it) and is pointed at Uber once your location is known.
 */
export function UberButton({ dest, from, className, title, children }: {
  dest: GoDest; from?: { lat: number; lng: number } | null; className: string; title?: string; children: ReactNode;
}) {
  const [driving, setDriving] = useState(0);
  function go() {
    setDriving((n) => n + 1);
    const tab = window.open('', '_blank');
    const send = (p: { lat: number; lng: number } | null) => {
      const url = config.routing.uberUrl(dest, p);
      // Let the car finish its run before the page changes.
      setTimeout(() => { if (tab && !tab.closed) tab.location.href = url; else window.location.href = url; }, 650);
    };
    if (from || !navigator.geolocation) { send(from ?? null); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => send({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => send(null),
      { enableHighAccuracy: false, timeout: 6000, maximumAge: 300000 },
    );
  }
  return (
    <button type='button' onClick={go} title={title}
            className={`relative overflow-hidden transition active:scale-[0.97] ${className}`}>
      {children}<UberMark />
      {driving > 0 && (
        <span key={driving} aria-hidden className='pointer-events-none absolute inset-y-0 flex items-center motion-safe:animate-[drive_700ms_cubic-bezier(0.5,0,0.2,1)_forwards] motion-reduce:hidden'>
          <svg viewBox='0 0 48 20' className='h-5 w-12 drop-shadow'>
            <path d='M4 13.5V11c0-1 .7-1.8 1.7-2l5.3-1 4.4-3.6c.6-.5 1.4-.8 2.2-.8h11.6c.9 0 1.7.4 2.3 1l3.5 3.6 6.4 1.1c1 .2 1.6 1 1.6 2v2.2c0 .6-.4 1-1 1H5c-.6 0-1-.4-1-1Z' fill='#f8fafc' stroke='#0f172a' strokeWidth='1.2' />
            <path d='M15.5 7.6 18.5 5h5v2.6h-8Zm10 0V5h4.2l2.6 2.6h-6.8Z' fill='#93c5fd' />
            <circle cx='13' cy='15' r='3' fill='#0f172a' /><circle cx='13' cy='15' r='1.2' fill='#cbd5e1' />
            <circle cx='36' cy='15' r='3' fill='#0f172a' /><circle cx='36' cy='15' r='1.2' fill='#cbd5e1' />
            <path d='M0 9h3M-1 12h3' stroke='#94a3b8' strokeWidth='1.2' strokeLinecap='round' />
          </svg>
        </span>
      )}
    </button>
  );
}

/** The Uber wordmark (Simple Icons, CC0), in the button's text colour, linking out to Uber. */
export function UberMark({ className = 'h-3.5' }: { className?: string }) {
  return (
    <svg role='img' aria-label='Uber' viewBox='0 7.6 24 8.8' className={`w-auto shrink-0 ${className}`} fill='currentColor'>
      <path d='M0 7.97v4.958c0 1.867 1.302 3.101 3 3.101.826 0 1.562-.316 2.094-.87v.736H6.27V7.97H5.082v4.888c0 1.257-.85 2.106-1.947 2.106-1.11 0-1.946-.827-1.946-2.106V7.971H0zm7.44 0v7.925h1.13v-.725c.521.532 1.257.86 2.06.86a3.006 3.006 0 0 0 3.034-3.01 3.01 3.01 0 0 0-3.033-3.024 2.86 2.86 0 0 0-2.049.861V7.971H7.439zm9.869 2.038c-1.687 0-2.965 1.37-2.965 3 0 1.72 1.334 3.01 3.066 3.01 1.053 0 1.913-.463 2.49-1.233l-.826-.611c-.43.577-.996.847-1.664.847-.973 0-1.753-.7-1.912-1.64h4.697v-.373c0-1.72-1.222-3-2.886-3zm6.295.068c-.634 0-1.098.294-1.381.758v-.713h-1.131v5.774h1.142V12.61c0-.894.544-1.47 1.291-1.47H24v-1.065h-.396zm-6.319.928c.85 0 1.564.588 1.756 1.47H15.52c.203-.882.916-1.47 1.765-1.47zm-6.732.012c1.086 0 1.98.883 1.98 2.004a1.993 1.993 0 0 1-1.98 2.001A1.989 1.989 0 0 1 8.56 13.02a1.99 1.99 0 0 1 1.992-2.004z' />
    </svg>
  );
}

export function GoPanel({ dest, lang, mode, onMode, status, distance, duration, remaining, following, onFollow, from, onClose, onRetry }: {
  dest: GoDest; lang: Language; mode: GoMode; onMode: (m: GoMode) => void; status: GoStatus;
  distance: number | null; duration: number | null;
  /** Straight-line metres left while following. */
  remaining: number | null;
  following: boolean; onFollow: () => void; from: { lat: number; lng: number } | null;
  onClose: () => void; onRetry: () => void;
}) {
  const t = translator(messages, lang);
  const arrived = following && remaining != null && remaining <= config.routing.arrivedM;
  return (
    <section data-map-ui aria-label={t('go.title', { name: dest.name })}
             className='absolute inset-x-2 bottom-[4.75rem] z-40 rounded-2xl bg-neutral-950/95 p-4 text-sm text-neutral-200 shadow-2xl ring-1 ring-white/10 backdrop-blur motion-safe:animate-[pop_180ms_ease-out] print:hidden sm:inset-x-0 sm:mx-auto sm:w-[380px]'>
      <div className='flex items-start gap-3'>
        <span className='grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-600/20 text-blue-300 ring-1 ring-blue-400/30'><Icon name='pin' size={18} /></span>
        <div className='min-w-0 flex-1'>
          <p className='text-[11px] uppercase tracking-wider text-neutral-500'>{t('go.to')}</p>
          <p className='truncate text-base font-semibold text-white'>{dest.name}</p>
        </div>
        <button type='button' onClick={onClose} aria-label={t('close')} title={t('close')}
                className='grid h-8 w-8 shrink-0 place-items-center rounded-full text-neutral-400 hover:bg-neutral-800 hover:text-white'><Icon name='close' size={16} /></button>
      </div>

      <div role='radiogroup' aria-label={t('go.mode')} className='mt-3 grid grid-cols-2 gap-1 rounded-xl bg-neutral-900 p-1'>
        {(['drive', 'walk'] as const).map((m) => (
          <button key={m} type='button' role='radio' aria-checked={mode === m} onClick={() => onMode(m)}
                  className={`rounded-lg py-1.5 text-sm font-medium transition ${mode === m ? 'bg-blue-600 text-white shadow' : 'text-neutral-300 hover:bg-neutral-800'}`}>
            {t(`go.${m}`)}
          </button>
        ))}
      </div>

      <div className='mt-3 min-h-[3rem]' aria-live='polite'>
        {status === 'locating' && <p className='flex items-center gap-2 text-neutral-400'><Spinner />{t('go.locating')}</p>}
        {status === 'routing' && <p className='flex items-center gap-2 text-neutral-400'><Spinner />{t('go.routing')}</p>}
        {status === 'noLocation' && <p className='text-amber-300'>{t('go.noLocation')}</p>}
        {status === 'error' && (
          <p className='text-red-300'>{t('go.error')} <button type='button' onClick={onRetry} className='underline hover:text-white'>{t('go.retry')}</button></p>
        )}
        {status === 'ready' && distance != null && duration != null && (
          arrived ? <p className='text-lg font-semibold text-emerald-300'>{t('go.arrived')}</p> : (
            <div>
              <p className='text-2xl font-semibold text-white'>
                {fmtTime(duration, t)} <span className='text-base font-normal text-neutral-400'>· {fmtDist(distance)}</span>
              </p>
              <p className='text-xs text-neutral-500'>
                {following && remaining != null ? t('go.left', { d: fmtDist(remaining) }) : mode === 'drive' ? t('go.noTraffic') : t('go.walkNote')}
              </p>
            </div>
          )
        )}
      </div>

      <div className='mt-3 grid grid-cols-2 gap-2'>
        <button type='button' onClick={onFollow} disabled={status !== 'ready'} aria-pressed={following}
                className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 font-semibold transition disabled:opacity-40 ${following ? 'bg-emerald-600 text-white hover:bg-emerald-500' : 'bg-blue-600 text-white hover:bg-blue-500'}`}>
          <Icon name={following ? 'stop' : 'play'} size={14} />{following ? t('go.stop') : t('go.start')}
        </button>
        <a href={config.routing.googleUrl(dest.lat, dest.lng, mode)} target='_blank' rel='noopener noreferrer'
           className='flex items-center justify-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 font-semibold text-zinc-100 ring-1 ring-white/15 hover:bg-white/20'>
          <Icon name='external' size={14} />{t('go.google')}
        </a>
      </div>
      <UberButton dest={dest} from={from}
                  className='mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-black px-3 py-2 font-semibold text-white ring-1 ring-white/20 hover:bg-zinc-900'>
        {t('go.uberRide')}
      </UberButton>
    </section>
  );
}

function Spinner() {
  return <span aria-hidden className='h-3 w-3 animate-spin rounded-full border-2 border-blue-500 border-t-transparent' />;
}
