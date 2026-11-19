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
    <section data-map-ui role='dialog' aria-labelledby='confirm-title'
             className='absolute left-2 right-2 top-[8.75rem] z-40 rounded-2xl bg-white p-4 text-sm text-zinc-800 shadow-2xl ring-1 ring-black/10 motion-safe:animate-[pop_200ms_ease-out] sm:left-3 sm:right-auto sm:w-[340px] dark:bg-zinc-900 dark:text-zinc-100 dark:ring-white/10 print:hidden'>
      <div className='flex items-start gap-3'>
        <span className='grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'>
          <Icon name={categoryIcon(item.category)} size={18} />
        </span>
        <div className='min-w-0 flex-1'>
          <p id='confirm-title' className='font-semibold'>{t('confirm.title', { place: name })}</p>
          <p className='mt-0.5 text-xs text-zinc-500 dark:text-zinc-400'>{t('confirm.body', { level: said, n: mins, d: item.distance_m })}</p>
        </div>
        <button type='button' onClick={notThere} aria-label={t('close')} className='grid h-7 w-7 shrink-0 place-items-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800'>
          <Icon name='close' size={14} />
        </button>
      </div>
      <div className='mt-3 grid grid-cols-5 gap-1.5'>
        {config.crowd.levels.map((l) => (
          <button key={l.level} type='button' disabled={busy} onClick={() => void answer(l.level)}
                  className='flex flex-col items-center gap-1 rounded-lg border border-zinc-200 px-1 py-2 text-[11px] font-medium transition hover:-translate-y-0.5 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800'>
            <span className='h-4 w-4 rounded-full' style={{ background: l.color }} />
            {tm(`level.${l.key}`)}
          </button>
        ))}
      </div>
      <div className='mt-2 flex items-center justify-between gap-2'>
        <button type='button' onClick={notThere} className='text-xs text-zinc-500 underline-offset-2 hover:underline'>{t('confirm.notHere')}</button>
        {busy && <span className='text-xs text-zinc-500'>{t('confirm.checking')}</span>}
      </div>
      {note && (
        <p role='status' className={`mt-2 text-xs ${note.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
          {note.key === 'result.signin'
            ? <Link href='/login?next=/map' className='font-medium underline'>{t('confirm.signin')}</Link>
            : t(note.key)}
        </p>
      )}
    </section>
  );
}
