'use client';
// The Community page: finds the viewer (or uses the city they pick), then shows
// the closest quiet place, an overview of the city's crowd right now, and the
// community's newest photos and posts there.
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/icons/Icon';
import { categoryIcon, quickIcon } from '@/features/crowd/config';
import { messages as crowdMessages } from '@/features/crowd/messages';
import { CityPicker } from '@/features/map/controls/CityPicker';
import { messages as mapMessages } from '@/features/map/messages';
import { messages as placeMessages } from '@/features/places/messages';
import { Spotlight } from '@/features/site/InfoFx';
import { Reveal } from '@/features/site/Reveal';
import { config, type Language } from '@/lib/config';
import { translator } from '@/lib/i18n';
import { messages } from './messages';

export type CommunityCity = { id: string; name: string; name_hi: string | null; state: string | null; lat: number; lng: number };
type Place = { id: string; name: string; name_hi: string | null; category: string; lat: number; lng: number; level: number; source: 'live' | 'estimated'; status?: string; here?: number };
type Media = { id: string; kind: 'photo' | 'video'; url: string; caption: string | null; author: string; place_id: string; place_name: string; created_at: string; comment_count: number; is_sample: boolean };
type Post =
  | { type: 'comment'; id: string; body: string; author: string; place_id: string; place: string; at: string; sample: boolean }
  | { type: 'alert'; id: string; kind: string; place_id: string | null; place: string | null; at: string; active: boolean; still_there: number; sample: boolean };
type LatLng = { lat: number; lng: number };

/** Straight-line distance in metres. */
function metres(a: LatLng, b: LatLng) {
  const r = Math.PI / 180;
  const x = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(x));
}
const fmtDist = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`);
const levelOf = (l: number) => config.crowd.levels[Math.min(4, Math.max(0, Math.round(l) - 1))];
// Walking at about 4.5 km/h, with streets ~1.3x longer than the straight line.
const walkMin = (m: number) => Math.max(1, Math.round((m * 1.3) / 75));

export function CommunityExplorer({ cities, lang, initialCity }: { cities: CommunityCity[]; lang: Language; initialCity: string | null }) {
  const t = translator(messages, lang);
  const tm = translator(mapMessages, lang);
  const tp = translator(placeMessages, lang);
  const tq = translator(crowdMessages, lang);
  const [cityId, setCityId] = useState<string>(initialCity ?? config.defaultCity);
  const [me, setMe] = useState<LatLng | null>(null);
  const [loc, setLoc] = useState<'idle' | 'finding' | 'on' | 'denied'>('idle');
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [media, setMedia] = useState<Media[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [failed, setFailed] = useState(false);
  // "5 min ago" is measured from when the data arrived.
  const [now, setNow] = useState(0);
  const city = cities.find((c) => c.id === cityId) ?? cities[0];
  const cityName = city ? (lang === 'hi' && city.name_hi) || city.name : '';

  const nearestCity = useCallback((p: LatLng) => cities.reduce<CommunityCity | null>((best, c) =>
    !best || metres(p, c) < metres(p, best) ? c : best, null), [cities]);

  const locate = useCallback(() => {
    if (!navigator.geolocation) { setLoc('denied'); return; }
    setLoc('finding');
    navigator.geolocation.getCurrentPosition((pos) => {
      const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setMe(p); setLoc('on');
      const near = nearestCity(p);
      if (near) setCityId(near.id);
    }, () => setLoc('denied'), { enableHighAccuracy: true, timeout: 10000, maximumAge: 120000 });
  }, [nearestCity]);

  // Find the viewer on arrival, unless the link already names a city.
  useEffect(() => { if (!initialCity) queueMicrotask(locate); }, [initialCity, locate]);

  // Load the city's places and the community's photos and posts.
  useEffect(() => {
    if (!cityId) return;
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) { setPlaces(null); setFailed(false); } });
    Promise.all([
      fetch(`/api/crowd?city=${encodeURIComponent(cityId)}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
      fetch(`/api/community?city=${encodeURIComponent(cityId)}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : { media: [], posts: [] })).catch(() => ({ media: [], posts: [] })),
    ]).then(([crowd, comm]) => {
      if (cancelled) return;
      setPlaces(crowd.places ?? []);
      setMedia(comm.media ?? []);
      setPosts(comm.posts ?? []);
      setNow(Date.now());
    }).catch(() => { if (!cancelled) setFailed(true); });
    // Keep the city in the address so the page can be shared.
    const u = new URL(window.location.href);
    u.searchParams.set('city', cityId);
    window.history.replaceState(null, '', u);
    return () => { cancelled = true; };
  }, [cityId]);

  // Distances from the viewer when they're in this city, else from the city centre.
  const origin: LatLng | null = me && city && nearestCity(me)?.id === city.id ? me : city ?? null;
  const fromYou = origin === me && !!me;

  const quiet = useMemo(() => {
    if (!places || !origin) return [];
    return places.filter((p) => Math.round(p.level) <= 2 && p.status !== 'unconfirmed')
      .map((p) => ({ ...p, d: metres(origin, p) }))
      .sort((a, b) => a.d - b.d || a.level - b.level)
      .slice(0, 5);
  }, [places, origin]);

  const overview = useMemo(() => {
    if (!places?.length) return null;
    const counts = [0, 0, 0, 0, 0];
    for (const p of places) counts[levelOf(p.level).level - 1]++;
    const byCat = new Map<string, { sum: number; n: number }>();
    for (const p of places) {
      const c = byCat.get(p.category) ?? { sum: 0, n: 0 };
      c.sum += p.level; c.n++; byCat.set(p.category, c);
    }
    const cats = [...byCat.entries()].filter(([, v]) => v.n >= 5).map(([k, v]) => ({ category: k, avg: v.sum / v.n, n: v.n }))
      .sort((a, b) => b.avg - a.avg);
    const hot = [...places].sort((a, b) =>
      (b.source === 'live' ? 1 : 0) - (a.source === 'live' ? 1 : 0) || b.level - a.level || (b.here ?? 0) - (a.here ?? 0)).slice(0, 5);
    return {
      total: places.length, live: places.filter((p) => p.source === 'live').length, counts,
      quietPct: Math.round(((counts[0] + counts[1]) / places.length) * 100),
      busiest: cats[0] ?? null, calm: cats.slice(-3).reverse(), hot,
    };
  }, [places]);

  const name = (p: { name: string; name_hi?: string | null }) => (lang === 'hi' && p.name_hi) || p.name;
  const ago = (iso: string) => {
    const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
    return m < 1 ? t('ago_now') : m < 60 ? t('ago_m', { n: m }) : m < 1440 ? t('ago_h', { n: Math.round(m / 60) }) : t('ago_d', { n: Math.round(m / 1440) });
  };
  const levelChip = (l: number, live: boolean) => {
    const lv = levelOf(l);
    return (
      <span className='inline-flex shrink-0 items-center gap-1.5 rounded-full bg-black/5 dark:bg-white/5 px-2 py-0.5 text-xs text-zinc-800 dark:text-zinc-200 ring-1 ring-black/10 dark:ring-white/10'>
        <span className='h-2 w-2 rounded-full' style={{ background: lv.color, opacity: live ? 1 : 0.65 }} />
        {tm(`level.${lv.key}`)}
        <span className='hidden text-zinc-500 min-[400px]:inline'>· {live ? t('ov.liveTag') : t('ov.estimate')}</span>
      </span>
    );
  };
  const label = (s: string) => <p className='mb-4 font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-[#0894FF]'>{s}</p>;

  const best = quiet[0];
  return (
    <>
      {/* Title and location */}
      <div className='mx-auto max-w-5xl'>
        <p className='mb-5 inline-flex items-center gap-2 rounded-full border border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.03] px-3 py-1 text-xs text-zinc-600 dark:text-zinc-400 backdrop-blur'>
          <span className='relative flex h-2 w-2'><span className='absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75' /><span className='relative inline-flex h-2 w-2 rounded-full bg-emerald-400' /></span>
          {fromYou ? t('near') : t('cityView', { city: cityName })}
        </p>
        <h1 key={cityId} className='text-balance text-5xl font-semibold tracking-tight text-zinc-900 dark:text-white motion-safe:animate-[rise_700ms_ease-out_both] sm:text-7xl'>
          {t('title', { city: cityName })}
        </h1>
        <p className='mt-5 max-w-2xl text-lg text-zinc-600 dark:text-zinc-400'>{t('intro')}</p>
        <div className='mt-7 flex flex-wrap items-center gap-2'>
          <CityPicker cities={cities} active={cityId} lang={lang} onPick={setCityId}
                      labels={{ pick: t('pick'), search: t('search'), none: t('none') }} />
          <button type='button' onClick={locate} disabled={loc === 'finding'}
                  className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium ring-1 transition ${loc === 'on' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-emerald-400/40' : 'bg-black/5 dark:bg-white/5 text-zinc-900 dark:text-zinc-100 ring-black/15 dark:ring-white/15 hover:bg-black/10 dark:hover:bg-white/10'}`}>
            <Icon name='locate' size={15} />{loc === 'finding' ? t('locating') : t('useLocation')}
          </button>
        </div>
        {loc === 'denied' && <p className='mt-3 text-sm text-amber-700 dark:text-amber-300/90'>{t('locDenied')}</p>}
      </div>

      <div className='mx-auto mt-14 max-w-5xl space-y-5'>
        {failed && <p className='rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-200 ring-1 ring-red-500/30'>{t('error')}</p>}
        {!places && !failed && (
          <p role='status' className='flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400'>
            <span aria-hidden className='h-3 w-3 animate-spin rounded-full border-2 border-blue-500 border-t-transparent' />{t('loading', { city: cityName })}
          </p>
        )}

        {places && (
          <div className='grid gap-5 lg:grid-cols-5'>
            {/* Closest quiet place */}
            <Reveal className='min-w-0 lg:col-span-3'>
              <Spotlight className='h-full p-6 sm:p-7'>
                {label(t('quiet.label'))}
                {!best ? <p className='text-zinc-600 dark:text-zinc-400'>{t('quiet.none')}</p> : (
                  <>
                    <div className='flex items-start gap-4'>
                      <span className='grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-400/30'>
                        <Icon name={categoryIcon(best.category)} size={22} />
                      </span>
                      <div className='min-w-0'>
                        <p className='truncate text-2xl font-semibold text-zinc-900 dark:text-white'>{name(best)}</p>
                        <p className='mt-0.5 text-sm text-zinc-600 dark:text-zinc-400'>{tp(`cat.${best.category}`)}</p>
                        <div className='mt-3 flex flex-wrap items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300'>
                          {levelChip(best.level, best.source === 'live')}
                          <span>{t('quiet.away', { d: fmtDist(best.d) })} {fromYou ? t('quiet.fromYou') : t('quiet.fromCentre')}</span>
                          {best.d < 3000 && <span className='text-zinc-500'>· {t('quiet.walk', { m: walkMin(best.d) })}</span>}
                        </div>
                      </div>
                    </div>
                    <Link href={`/map?place=${best.id}`}
                          className='group mt-5 inline-flex items-center gap-2 rounded-full bg-[#0894FF] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#2aa3ff]'>
                      {t('quiet.open')} <span aria-hidden className='transition-transform group-hover:translate-x-1'>→</span>
                    </Link>
                    {quiet.length > 1 && (
                      <div className='mt-6'>
                        <p className='mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500'>{t('quiet.more')}</p>
                        <ul className='divide-y divide-black/5 dark:divide-white/5 rounded-xl ring-1 ring-black/10 dark:ring-white/10'>
                          {quiet.slice(1).map((p) => (
                            <li key={p.id}>
                              <Link href={`/map?place=${p.id}`} className='flex items-center gap-3 px-3 py-2.5 text-sm transition hover:bg-black/5 dark:hover:bg-white/5'>
                                <span className='h-2.5 w-2.5 shrink-0 rounded-full' style={{ background: levelOf(p.level).color }} />
                                <span className='min-w-0 flex-1 truncate text-zinc-900 dark:text-zinc-100'>{name(p)}</span>
                                <span className='hidden shrink-0 text-xs text-zinc-500 sm:inline'>{tp(`cat.${p.category}`)}</span>
                                <span className='w-16 shrink-0 text-right text-xs tabular-nums text-zinc-600 dark:text-zinc-400'>{fmtDist(p.d)}</span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )}
              </Spotlight>
            </Reveal>

            {/* City overview */}
            {overview && (
              <Reveal delay={90} className='min-w-0 lg:col-span-2'>
                <Spotlight className='h-full p-6 sm:p-7'>
                  {label(t('ov.label'))}
                  <div className='grid grid-cols-2 gap-3'>
                    {[
                      { k: t('ov.places'), v: overview.total.toLocaleString(lang === 'hi' ? 'hi-IN' : 'en-IN') },
                      { k: t('ov.live'), v: String(overview.live) },
                      { k: t('ov.quiet'), v: `${overview.quietPct}%` },
                      { k: t('ov.busiest'), v: overview.busiest ? tp(`cat.${overview.busiest.category}`) : '-' },
                    ].map((s) => (
                      <div key={s.k} className='rounded-xl bg-black/[0.03] dark:bg-white/[0.03] p-3 ring-1 ring-black/10 dark:ring-white/10'>
                        <p className='truncate text-lg font-semibold text-zinc-900 dark:text-white'>{s.v}</p>
                        <p className='text-xs text-zinc-500'>{s.k}</p>
                      </div>
                    ))}
                  </div>
                  <p className='mb-2 mt-5 text-xs font-medium uppercase tracking-wider text-zinc-500'>{t('ov.mix')}</p>
                  <div className='flex h-3 overflow-hidden rounded-full ring-1 ring-black/10 dark:ring-white/10' role='img'
                       aria-label={config.crowd.levels.map((l, i) => `${tm(`level.${l.key}`)} ${overview.counts[i]}`).join(', ')}>
                    {config.crowd.levels.map((l, i) => overview.counts[i] > 0 && (
                      <span key={l.key} className='h-full transition-[width] duration-700' style={{ width: `${(overview.counts[i] / overview.total) * 100}%`, background: l.color }} />
                    ))}
                  </div>
                  <div className='mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-600 dark:text-zinc-400'>
                    {config.crowd.levels.map((l, i) => (
                      <span key={l.key} className='flex items-center gap-1'><span className='h-2 w-2 rounded-full' style={{ background: l.color }} />{tm(`level.${l.key}`)} {overview.counts[i]}</span>
                    ))}
                  </div>
                  {overview.calm.length > 0 && (
                    <>
                      <p className='mb-2 mt-5 text-xs font-medium uppercase tracking-wider text-zinc-500'>{t('ov.calm')}</p>
                      <div className='flex flex-wrap gap-1.5'>
                        {overview.calm.map((c) => (
                          <span key={c.category} className='inline-flex items-center gap-1.5 rounded-full bg-black/5 dark:bg-white/5 px-2.5 py-1 text-xs text-zinc-800 dark:text-zinc-200 ring-1 ring-black/10 dark:ring-white/10'>
                            <Icon name={categoryIcon(c.category)} size={13} />{tp(`cat.${c.category}`)}
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                </Spotlight>
              </Reveal>
            )}
          </div>
        )}

        {overview && (
          <Reveal>
            <Spotlight className='p-6 sm:p-7'>
              {label(t('ov.hot'))}
              <ul className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
                {overview.hot.map((p) => (
                  <li key={p.id} className='min-w-0'>
                    <Link href={`/map?place=${p.id}`} className='flex items-center gap-3 rounded-xl px-3 py-2.5 ring-1 ring-black/10 dark:ring-white/10 transition hover:bg-black/5 dark:hover:bg-white/5'>
                      <span className='grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-black/5 dark:bg-white/5 text-zinc-700 dark:text-zinc-300'><Icon name={categoryIcon(p.category)} size={17} /></span>
                      <span className='min-w-0 flex-1'>
                        <span className='block truncate text-sm font-medium text-zinc-900 dark:text-zinc-100'>{name(p)}</span>
                        <span className='text-xs text-zinc-500'>{tp(`cat.${p.category}`)}</span>
                      </span>
                      {levelChip(p.level, p.source === 'live')}
                    </Link>
                  </li>
                ))}
              </ul>
            </Spotlight>
          </Reveal>
        )}

        {/* Community photos */}
        {places && (
          <Reveal>
            <Spotlight className='p-6 sm:p-7'>
              {label(t('photos.label'))}
              {media.length === 0 ? <p className='text-zinc-600 dark:text-zinc-400'>{t('photos.none', { city: cityName })}</p> : (
                <div className='grid grid-cols-2 gap-3 sm:grid-cols-3'>
                  {media.map((m) => (
                    <Link key={m.id} href={`/map?place=${m.place_id}`}
                          className='group relative aspect-square overflow-hidden rounded-xl bg-zinc-200 dark:bg-zinc-900 ring-1 ring-black/10 dark:ring-white/10'>
                      {m.kind === 'video'
                        ? <video src={m.url} muted playsInline preload='metadata' className='h-full w-full object-cover transition-transform duration-500 group-hover:scale-105' />
                        // eslint-disable-next-line @next/next/no-img-element
                        : <img src={m.url} alt={m.caption ?? m.place_name} loading='lazy' className='h-full w-full object-cover transition-transform duration-500 group-hover:scale-105' />}
                      {m.kind === 'video' && <span className='absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white'><Icon name='play' size={12} /></span>}
                      {m.is_sample && <span className='absolute left-2 top-2 rounded bg-amber-500/90 px-1.5 py-0.5 text-[10px] font-semibold text-black'>{t('photos.sample')}</span>}
                      <span className='absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-2.5 pt-8 text-left'>
                        <span className='block truncate text-sm font-medium text-white'>{m.place_name}</span>
                        <span className='block truncate text-[11px] text-zinc-300'>{m.caption ? `${m.caption} · ` : ''}{t('photos.by', { name: m.author })} · {ago(m.created_at)}</span>
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </Spotlight>
          </Reveal>
        )}

        {/* Community posts */}
        {places && (
          <Reveal>
            <Spotlight className='p-6 sm:p-7'>
              {label(t('posts.label'))}
              {posts.length === 0 ? <p className='text-zinc-600 dark:text-zinc-400'>{t('posts.none', { city: cityName })}</p> : (
                <ul className='space-y-2'>
                  {posts.map((p) => (
                    <li key={`${p.type}-${p.id}`} className='flex gap-3 rounded-xl px-3 py-3 ring-1 ring-black/10 dark:ring-white/10'>
                      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${p.type === 'alert' ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300' : 'bg-blue-500/15 text-blue-700 dark:text-blue-300'}`}>
                        <Icon name={p.type === 'alert' ? quickIcon(p.kind) : 'comment'} size={16} />
                      </span>
                      <div className='min-w-0 flex-1 text-sm'>
                        {p.type === 'comment' ? (
                          <>
                            <p className='text-zinc-600 dark:text-zinc-400'>
                              <Link href={`/map?place=${p.place_id}`} className='hover:text-zinc-900 dark:hover:text-white'>{t('posts.said', { name: p.author, place: p.place })}</Link>
                              <span className='text-zinc-500 dark:text-zinc-600'> · {ago(p.at)}</span>
                            </p>
                            <p className='mt-0.5 break-words text-zinc-900 dark:text-zinc-100'>{p.body}</p>
                          </>
                        ) : (
                          <>
                            <p className='text-zinc-600 dark:text-zinc-400'>
                              {p.place_id ? <Link href={`/map?place=${p.place_id}`} className='hover:text-zinc-900 dark:hover:text-white'>{t('posts.alert', { place: p.place ?? '' })}</Link> : t('posts.alertCity')}
                              <span className='text-zinc-500 dark:text-zinc-600'> · {ago(p.at)}{p.active ? '' : ` · ${t('posts.ended')}`}</span>
                            </p>
                            <p className='mt-0.5 text-zinc-900 dark:text-zinc-100'>
                              {tq(`kind.${p.kind}`)}
                              {p.still_there > 0 && <span className='text-zinc-500'> · {t('posts.still', { n: p.still_there })}</span>}
                              {p.sample && <span className='ml-2 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300'>{t('photos.sample')}</span>}
                            </p>
                          </>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Spotlight>
          </Reveal>
        )}
      </div>
    </>
  );
}
