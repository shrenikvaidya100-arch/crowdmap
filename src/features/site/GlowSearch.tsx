'use client';
// "Where are we going today?" search on the home page, inside the glow effect.
// Fades in once the visitor scrolls past the hero. Suggests CrowdMap places first
// (with their crowd level), then anywhere in the world from OpenStreetMap's
// Nominatim. Picking a result opens it on the map.
//
// Nominatim usage policy: at most 1 request a second, results cached, and the
// browser sends the site as Referer. We wait 500 ms after typing stops.
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { GlowEffect } from '@/components/core/glow-effect';
import { Icon } from '@/components/icons/Icon';
import { categoryIcon } from '@/features/crowd/config';
import type { SearchHit } from '@/features/search/SearchBox';
import { config, type Language } from '@/lib/config';

type WorldHit = { id: string; name: string; detail: string; lat: number; lng: number; zoom: number };
type Result = { kind: 'place'; hit: SearchHit } | { kind: 'world'; hit: WorldHit };

const cache = new Map<string, WorldHit[]>();
let lastNominatim = 0;

async function searchWorld(q: string, lang: Language, signal: AbortSignal): Promise<WorldHit[]> {
  const key = `${lang}:${q.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const wait = lastNominatim + 1000 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  if (signal.aborted) return [];
  lastNominatim = Date.now();
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&accept-language=${lang}&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { signal, referrerPolicy: 'strict-origin-when-cross-origin' });
  if (!res.ok) return [];
  const rows = (await res.json()) as { place_id: number; name: string; display_name: string; lat: string; lon: string; place_rank: number }[];
  const out = rows.map((r) => ({
    id: String(r.place_id),
    name: r.name || r.display_name.split(',')[0],
    detail: r.display_name.split(',').slice(1, 4).join(',').trim(),
    lat: Number(r.lat),
    lng: Number(r.lon),
    // Countries and states zoom out, streets and buildings zoom in.
    zoom: r.place_rank <= 4 ? 4 : r.place_rank <= 12 ? 8 : r.place_rank <= 16 ? 12 : 16,
  }));
  cache.set(key, out);
  return out;
}

const levelColor = (l: number) => config.crowd.levels.find((x) => x.level === l)?.color ?? config.crowd.noDataColor;

export function GlowSearch({ lang, labels }: {
  lang: Language;
  labels: { placeholder: string; search: string; cursor: string; ours: string; world: string; none: string; searching: string; level: Record<number, string> };
}) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Result[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(0);
  const listId = 'glow-search-results';
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) { queueMicrotask(() => { setResults(null); setBusy(false); }); return; }
    const ctrl = new AbortController();
    queueMicrotask(() => setBusy(true));
    const timer = setTimeout(async () => {
      try {
        const [ours, world] = await Promise.all([
          fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: ctrl.signal })
            .then((r) => (r.ok ? (r.json() as Promise<SearchHit[]>) : [])).catch(() => [] as SearchHit[]),
          searchWorld(query, lang, ctrl.signal).catch(() => [] as WorldHit[]),
        ]);
        if (ctrl.signal.aborted) return;
        setResults([
          ...ours.slice(0, 5).map((hit) => ({ kind: 'place' as const, hit })),
          ...world.map((hit) => ({ kind: 'world' as const, hit })),
        ]);
        setActive(0);
      } finally {
        if (!ctrl.signal.aborted) setBusy(false);
      }
    }, 500);
    return () => { ctrl.abort(); clearTimeout(timer); };
  }, [q, lang]);

  function open(r: Result) {
    if (r.kind === 'place') router.push(`/map?place=${r.hit.id}`);
    else router.push(`/map?lat=${r.hit.lat.toFixed(5)}&lng=${r.hit.lng.toFixed(5)}&z=${r.hit.zoom}`);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!results?.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % results.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + results.length) % results.length); }
    else if (e.key === 'Enter') { e.preventDefault(); open(results[active]); }
    else if (e.key === 'Escape') { setResults(null); }
  }

  const name = (h: SearchHit) => (lang === 'hi' && h.name_hi) || h.name;
  const firstWorld = results?.findIndex((r) => r.kind === 'world') ?? -1;

  return (
    <div className='relative w-full max-w-[540px]' data-cursor={labels.cursor}>
      <GlowEffect colors={['#0894FF', '#C959DD', '#FF2E54', '#FF9004']} mode='static' blur='medium' />
      <div className='relative rounded-xl bg-black p-2 text-white'>
        <div className='flex items-center gap-2 px-2'>
          <Icon name='search' size={20} className='shrink-0 text-zinc-500' />
          <input
            ref={input}
            type='text'
            inputMode='search'
            enterKeyHint='search'
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={labels.placeholder}
            aria-label={labels.search}
            role='combobox'
            aria-expanded={!!results?.length}
            aria-controls={listId}
            aria-activedescendant={results?.length ? `${listId}-${active}` : undefined}
            autoComplete='off'
            maxLength={100}
            className='h-12 w-full bg-transparent text-base text-white placeholder:text-zinc-500 focus:outline-none'
          />
        </div>
        {(busy || results) && (
          <div className='border-t border-zinc-800 px-1 pb-1 pt-2'>
            {busy && !results && <p className='px-3 py-2 text-sm text-zinc-400'>{labels.searching}</p>}
            {results && results.length === 0 && <p className='px-3 py-2 text-sm text-zinc-400'>{labels.none}</p>}
            {results && results.length > 0 && (
              <ul id={listId} role='listbox' aria-label={labels.search} className='max-h-80 overflow-y-auto'>
                {results.map((r, i) => (
                  <li key={`${r.kind}-${r.hit.id}`}>
                    {(i === 0 && r.kind === 'place') && <p className='px-3 pb-1 text-[11px] uppercase tracking-wider text-zinc-500'>{labels.ours}</p>}
                    {i === firstWorld && <p className='px-3 pb-1 pt-2 text-[11px] uppercase tracking-wider text-zinc-500'>{labels.world}</p>}
                    <button
                      id={`${listId}-${i}`}
                      type='button'
                      role='option'
                      aria-selected={i === active}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => open(r)}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm ${i === active ? 'bg-zinc-800' : ''}`}
                    >
                      {r.kind === 'place' ? (
                        <>
                          <Icon name={categoryIcon(r.hit.category)} size={18} className='shrink-0 text-zinc-400' />
                          <span className='min-w-0 flex-1 truncate'>{name(r.hit)}</span>
                          <span className='flex shrink-0 items-center gap-1.5 text-xs text-zinc-400'>
                            <span className='h-2 w-2 rounded-full' style={{ background: levelColor(r.hit.level) }} />
                            {labels.level[r.hit.level]}
                          </span>
                        </>
                      ) : (
                        <>
                          <Icon name='pin' size={18} className='shrink-0 text-zinc-400' />
                          <span className='min-w-0 flex-1'>
                            <span className='block truncate'>{r.hit.name}</span>
                            {r.hit.detail && <span className='block truncate text-xs text-zinc-500'>{r.hit.detail}</span>}
                          </span>
                        </>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
