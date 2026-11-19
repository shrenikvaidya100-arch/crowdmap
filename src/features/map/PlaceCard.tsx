'use client';
// The place card shown over the map when a place is picked (KokonutUI CardFlip).
// Front: photos (main photo + up to three thumbnails that swap it), name, type and
// the current crowd level. Back: address, opening hours, best time today, today's
// pattern as plain text, the reminder, and More details (the full place panel).
// Tapping or dragging the card turns it; buttons never do.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import CardFlip from '@/components/core/card-flip';
import { Icon } from '@/components/icons/Icon';
import { Reminder } from '@/features/alerts/Reminder';
import { messages as placeMessages } from '@/features/places/messages';
import { config, type Language } from '@/lib/config';
import { translator } from '@/lib/i18n';
import { GoButtons, type GoDest } from './GoPanel';
import { messages } from './messages';

type Details = {
  place: { id: string; name: string; name_hi: string | null; category: string; address: string | null; lat: number; lng: number };
  crowd: { level: number; source: 'live' | 'estimated' };
};
type Photo = { id: string; kind: string; url: string | null; caption: string | null; credit?: string };
type WebPhotos = { photos: { url: string; credit: string }[]; satellite: { url: string; credit: string } };
type Forecast = { hours: { hour: number; level: number }[]; best: { hour: number; level: number } | null };

const levelColor = (l: number) => config.crowd.levels.find((x) => x.level === l)?.color ?? config.crowd.noDataColor;
// Hours shown in "today's pattern".
const PATTERN_HOURS = [6, 9, 12, 15, 18, 21];

export function PlaceCard({ placeId, lang, onMore, onClose, onGo, me, restoreFocus, extra }: {
  placeId: string; lang: Language; onMore: () => void; onClose: () => void;
  /** Shown under the card (admin controls). */
  extra?: (name: string) => ReactNode;
  /** Directions to this place (drawn on the map). */
  onGo: (dest: GoDest) => void;
  /** The viewer's position, if known (Uber pickup). */
  me?: { lat: number; lng: number } | null;
  /** Focus the card again (after the full panel closes). */
  restoreFocus?: number;
}) {
  const t = translator(messages, lang);
  const tp = translator(placeMessages, lang);
  const [data, setData] = useState<Details | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [main, setMain] = useState(0);
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [failed, setFailed] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`/api/places/${placeId}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
      fetch(`/api/media?place=${placeId}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : { items: [] })).catch(() => ({ items: [] })),
      fetch(`/api/places/${placeId}/forecast`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`/api/places/${placeId}/photos`).then((r) => (r.ok ? r.json() : null)).catch(() => null) as Promise<WebPhotos | null>,
    ]).then(([d, m, f, web]) => {
      if (cancelled) return;
      setData(d);
      // People's own photos first, then photos from the web, then a satellite view, so the top is never empty.
      const own = ((m.items ?? []) as Photo[]).filter((p) => p.kind === 'photo' && p.url);
      const fromWeb: Photo[] = (web?.photos ?? []).map((p, i) => ({ id: `web-${i}`, kind: 'photo', url: p.url, caption: null, credit: p.credit }));
      const all = [...own, ...fromWeb].slice(0, 4);
      setPhotos(all.length ? all : web ? [{ id: 'sat', kind: 'photo', url: web.satellite.url, caption: null, credit: web.satellite.credit }] : []);
      setForecast(f);
      setMain(0);
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [placeId]);

  // Close with Escape; focus the card when it opens or comes back.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  useEffect(() => {
    if (data) box.current?.querySelector<HTMLElement>('[aria-roledescription="flip card"]')?.focus({ preventScroll: true });
  }, [data, restoreFocus]);

  const hourLabel = (h: number) => new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { hour: 'numeric', hour12: true, timeZone: 'UTC' })
    .format(new Date(Date.UTC(2000, 0, 1, h))).replace(/\s?([ap])\.?m\.?/i, (_, x) => ` ${x.toUpperCase()}M`);
  const level = (l: number) => t(`level.${config.crowd.levels[Math.min(4, Math.max(0, Math.round(l) - 1))].key}`);

  const name = data ? (lang === 'hi' && data.place.name_hi) || data.place.name : '';
  const shown = photos[main];
  const dest: GoDest | null = data ? { lat: data.place.lat, lng: data.place.lng, name } : null;
  const go = dest && <GoButtons dest={dest} from={me} lang={lang} onGo={() => onGo(dest)} />;

  const front = (
    <div className='flex h-full flex-col'>
      <div className='relative h-[50%] shrink-0 overflow-hidden bg-zinc-900'>
        {shown?.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shown.url} alt={shown.caption ?? name} draggable={false} referrerPolicy='no-referrer'
               className='h-full w-full object-cover motion-safe:animate-[pop_400ms_ease-out]' />
        ) : (
          <div className='flex h-full items-end bg-gradient-to-br from-zinc-800 to-zinc-950 p-4'>
            <p className='text-xl font-semibold leading-tight text-zinc-100'>{name}</p>
          </div>
        )}
        {shown?.credit && (
          <p className='absolute right-1.5 top-1.5 max-w-[85%] truncate rounded bg-black/55 px-1.5 py-0.5 text-[9px] text-zinc-200'>{shown.credit}</p>
        )}
        {photos.length > 1 && (
          <div className='absolute bottom-2 left-2 flex gap-1.5'>
            {photos.slice(0, 3).map((p, i) => (
              <button key={p.id} type='button' onClick={() => setMain(i)} aria-label={t('card.photo', { n: i + 1 })} aria-pressed={i === main}
                      className={`h-10 w-10 overflow-hidden rounded-md ring-2 ${i === main ? 'ring-blue-500' : 'ring-white/40'}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url ?? ''} alt='' draggable={false} className='h-full w-full object-cover' />
              </button>
            ))}
          </div>
        )}
      </div>
      <div className='flex flex-1 flex-col justify-between gap-2 p-3.5'>
        <div>
          <p className='text-lg font-semibold leading-snug text-white'>{name}</p>
          <p className='text-sm text-zinc-400'>{data ? tp(`cat.${data.place.category}`) : ''}</p>
        </div>
        {data && (
          <p className='flex items-center gap-2 text-sm text-zinc-200'>
            <span className='h-2.5 w-2.5 rounded-full' style={{ background: levelColor(data.crowd.level), opacity: data.crowd.source === 'live' ? 1 : 0.6 }} />
            {t('card.currently', { level: level(data.crowd.level) })}
            {data.crowd.source !== 'live' && <span className='text-xs text-zinc-500'>{t('card.estimate')}</span>}
          </p>
        )}
        <div className='space-y-1.5'>
          {go}
          <p className='hidden text-center text-[11px] text-zinc-500 sm:block'>{t('card.turn')}</p>
        </div>
      </div>
    </div>
  );

  const pattern = forecast?.hours?.length
    ? PATTERN_HOURS.map((h) => forecast.hours.find((x) => x.hour === h)).filter(Boolean) as { hour: number; level: number }[]
    : [];

  // Quietest hour still ahead today (India time); say so plainly when it's all busy.
  const nowHour = Number(new Intl.DateTimeFormat('en-IN', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }).format(new Date()));
  const ahead = (forecast?.hours ?? []).filter((h) => h.hour >= nowHour);
  const quietest = ahead.reduce<{ hour: number; level: number } | null>((b, h) => (!b || h.level < b.level ? h : b), null);
  const bestText = !forecast?.hours?.length ? t('card.noForecast')
    : !quietest ? t('card.dayOver')
    : Math.round(quietest.level) >= 4 ? t('card.busyRest')
    : `${hourLabel(quietest.hour)}, ${level(quietest.level)}`;

  const back = (
    <div className='flex h-full flex-col gap-3 overflow-y-auto p-4 text-sm'>
      <p className='font-semibold text-white'>{name}</p>
      <dl className='space-y-2.5'>
        <div><dt className='text-[11px] uppercase tracking-wider text-zinc-500'>{t('card.address')}</dt>
          <dd className='text-zinc-200'>{data?.place.address || t('card.noAddress')}</dd></div>
        <div><dt className='text-[11px] uppercase tracking-wider text-zinc-500'>{t('card.hours')}</dt>
          <dd className='text-zinc-200'>{t('card.noHours')}</dd></div>
        <div><dt className='text-[11px] uppercase tracking-wider text-zinc-500'>{t('card.best')}</dt>
          <dd className='text-zinc-200'>{bestText}</dd></div>
        <div><dt className='text-[11px] uppercase tracking-wider text-zinc-500'>{t('card.today')}</dt>
          <dd className='text-zinc-200'>{pattern.length ? pattern.map((p) => `${hourLabel(p.hour)} ${level(p.level)}`).join(', ') : t('card.noForecast')}</dd></div>
      </dl>
      <div className='mt-auto space-y-2'>
        {data && <Reminder placeId={placeId} placeName={name} lang={lang} compact tone='dark' />}
        {go}
        <button type='button' onClick={onMore} className='w-full rounded-lg bg-blue-600 px-3 py-2 font-medium text-white hover:bg-blue-500'>
          {t('card.more')}
        </button>
      </div>
    </div>
  );

  return (
    <div ref={box} className='flex flex-col items-center gap-2'>
      <button type='button' onClick={onClose} aria-label={t('close')} title={t('close')}
              className='grid h-8 w-8 place-items-center self-end rounded-full bg-zinc-950/90 text-zinc-200 ring-1 ring-white/10 hover:text-white'>
        <Icon name='close' size={16} />
      </button>
      {failed ? (
        <p className='rounded-xl bg-zinc-950 px-4 py-3 text-sm text-zinc-200'>{t('result.error')}</p>
      ) : !data ? (
        <div className='grid aspect-[7/10] w-[220px] place-items-center rounded-2xl bg-zinc-950 text-sm text-zinc-400 ring-1 ring-zinc-800 sm:w-[260px]'>{t('loading')}</div>
      ) : (
        <CardFlip key={placeId} label={name} front={front} back={back}
                  className='w-[220px] sm:w-[260px]'
                  faceClassName='border-zinc-800 bg-zinc-950 text-zinc-100' />
      )}
      {data && extra?.(name)}
    </div>
  );
}
