'use client';
// "Is it crowded?" prompt. When someone reports a crowd level, it waits for a
// second person before going live. People with the map open within a few hundred
// metres are asked: they tap a level (checked against their GPS like any report)
// or say they're not there. Uses the viewer's position only if they already
// shared it (Locate, Share location, Directions) or granted location before.
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/icons/Icon';
import { messages as mapMessages } from '@/features/map/messages';
import { config, type Language } from '@/lib/config';
import { translator } from '@/lib/i18n';
import { submitCrowdReport } from './actions';
import { categoryIcon } from './config';
import { getGpsFix, GpsError } from './gps';
import { messages } from './messages';

type Waiting = { id: string; name: string; name_hi: string | null; category: string; distance_m: number; level: number; at: string };
type LatLng = { lat: number; lng: number };

const DISMISSED = 'crowdmap-confirm-dismissed';
const readDismissed = (): string[] => { try { return JSON.parse(sessionStorage.getItem(DISMISSED) ?? '[]'); } catch { return []; } };
const addDismissed = (id: string) => { try { sessionStorage.setItem(DISMISSED, JSON.stringify([...readDismissed(), id].slice(-50))); } catch { /* private mode */ } };

export function ConfirmPrompt({ lang, me, onLocated, onConfirmed, hidden }: {
  lang: Language; me: LatLng | null; onLocated: (p: LatLng) => void; onConfirmed: () => void; hidden?: boolean;
}) {
  const t = translator(messages, lang);
  const tm = translator(mapMessages, lang);
  const [item, setItem] = useState<Waiting | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; key: string } | null>(null);
  const [now, setNow] = useState(0);
  const meRef = useRef(me);
  useEffect(() => { meRef.current = me; }, [me]);

  const check = useCallback(async () => {
    let pos = meRef.current;
    // Only use location the viewer already allowed; never ask from here.
    if (!pos && navigator.permissions && navigator.geolocation) {
      try {
        const st = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
        if (st.state === 'granted') {
          pos = await new Promise<LatLng | null>((res) => navigator.geolocation.getCurrentPosition(
            (p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }), () => res(null), { maximumAge: 120000, timeout: 8000 }));
          if (pos) onLocated(pos);
        }
      } catch { /* permissions API not available */ }
    }
    if (!pos) return;
    try {
      const r = await fetch(`/api/crowd/pending?lat=${pos.lat}&lng=${pos.lng}`, { cache: 'no-store' });
      if (!r.ok) return;
      const { places } = (await r.json()) as { places: Waiting[] };
      const skip = new Set(readDismissed());
      setNow(Date.now());
      setItem((cur) => (cur && places.some((p) => p.id === cur.id) ? cur : places.find((p) => !skip.has(p.id)) ?? null));
    } catch { /* offline: try again next time */ }
  }, [onLocated]);

  useEffect(() => {
    const first = setTimeout(() => void check(), 1500);
    const id = setInterval(() => void check(), config.crowd.confirmCheckMs);
    return () => { clearTimeout(first); clearInterval(id); };
  }, [check]);
  // Check again as soon as a position becomes known.
  useEffect(() => {
    if (!me) return;
    const id = setTimeout(() => void check(), 0);
    return () => clearTimeout(id);
  }, [me, check]);

  if (!item || hidden) return null;
  const name = (lang === 'hi' && item.name_hi) || item.name;
  const mins = Math.max(1, Math.round((now - new Date(item.at).getTime()) / 60000));
  const said = tm(`level.${config.crowd.levels[Math.min(4, Math.max(0, item.level - 1))].key}`);

  async function answer(level: number) {
    if (!item) return;
    setBusy(true); setNote(null);
    try {
      const fix = await getGpsFix();
      const res = await submitCrowdReport({ placeId: item.id, level, fix });
      if (res.ok) {
        addDismissed(item.id);
        setNote({ ok: true, key: 'confirm.thanks' });
        onConfirmed();
        setTimeout(() => { setItem(null); setNote(null); }, 2500);
      } else setNote({ ok: false, key: `result.${res.reason}` });
    } catch (err) {
      setNote({ ok: false, key: err instanceof GpsError ? `gps.${err.code}` : 'result.error' });
    } finally {
      setBusy(false);
    }
  }
  function notThere() {
    if (item) addDismissed(item.id);
    setItem(null); setNote(null);
  }

  return (
    // A notification that slides in from the top-right corner, like a phone push.
    <section data-map-ui role='alertdialog' aria-labelledby='confirm-title' aria-describedby='confirm-body'
             className='fixed right-3 top-3 z-[55] w-[calc(100%-1.5rem)] max-w-[360px] overflow-hidden rounded-2xl bg-white/95 text-sm text-zinc-800 shadow-[0_12px_40px_-8px_rgba(0,0,0,0.35)] ring-1 ring-black/10 backdrop-blur-xl motion-safe:animate-[toastin_320ms_cubic-bezier(0.2,0.9,0.3,1.2)] dark:bg-zinc-900/95 dark:text-zinc-100 dark:ring-white/10 print:hidden'>
      <div className='flex items-center gap-2 border-b border-zinc-100 px-3.5 py-2 text-[11px] font-medium text-zinc-500 dark:border-zinc-800'>
        <span className='grid h-4 w-4 place-items-center rounded bg-blue-600 text-white'><Icon name='logo' size={11} /></span>
        CrowdMap
        <span className='text-zinc-400'>· {t('confirm.now')}</span>
        <button type='button' onClick={notThere} aria-label={t('close')} className='ml-auto grid h-6 w-6 place-items-center rounded-full text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'>
          <Icon name='close' size={13} />
        </button>
      </div>
      <div className='flex items-start gap-3 px-3.5 pt-3'>
        <span className='grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'>
          <Icon name={categoryIcon(item.category)} size={17} />
        </span>
        <div className='min-w-0 flex-1'>
          <p id='confirm-title' className='font-semibold leading-snug'>{t('confirm.title', { place: name })}</p>
          <p id='confirm-body' className='mt-0.5 text-xs text-zinc-500 dark:text-zinc-400'>{t('confirm.body', { level: said, n: mins, d: item.distance_m })}</p>
        </div>
      </div>
      <div className='grid grid-cols-5 gap-1 px-3.5 pt-3'>
        {config.crowd.levels.map((l) => (
          <button key={l.level} type='button' disabled={busy} onClick={() => void answer(l.level)} aria-label={tm(`level.${l.key}`)}
                  className='flex flex-col items-center gap-1 rounded-lg py-1.5 text-[10px] font-medium text-zinc-600 transition-colors hover:text-zinc-900 disabled:opacity-50 dark:text-zinc-300 dark:hover:text-white'>
            <span className='h-5 w-5 rounded-full ring-2 ring-white shadow-sm transition-transform hover:scale-110 dark:ring-zinc-900' style={{ background: l.color }} />
            {tm(`level.${l.key}`)}
          </button>
        ))}
      </div>
      <div className='flex items-center justify-between gap-2 px-3.5 pb-3 pt-1'>
        <button type='button' onClick={notThere} className='text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'>{t('confirm.notHere')}</button>
        {busy && <span className='text-xs text-zinc-500'>{t('confirm.checking')}</span>}
        {note && !busy && (
          <p role='status' className={`text-xs ${note.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
            {note.key === 'result.signin'
              ? <Link href='/login?next=/map' className='font-medium underline'>{t('confirm.signin')}</Link>
              : t(note.key)}
          </p>
        )}
      </div>
    </section>
  );
}
