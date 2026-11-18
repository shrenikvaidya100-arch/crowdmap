'use client';
// City picker on the map: one button with the current city; opens a searchable
// list of every city, grouped by state. Replaces the row of city chips now that
// CrowdMap covers all of India.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/icons/Icon';

export type PickerCity = { id: string; name: string; name_hi: string | null; state: string | null };

export function CityPicker({ cities, active, lang, onPick, labels }: {
  cities: PickerCity[];
  active: string | null;
  lang: 'en' | 'hi';
  onPick: (id: string) => void;
  labels: { pick: string; search: string; none: string };
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const name = (c: PickerCity) => (lang === 'hi' && c.name_hi) || c.name;
  const current = cities.find((c) => c.id === active);

  // Close on a click outside or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('pointerdown', onDown); window.removeEventListener('keydown', onKey); };
  }, [open]);

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const hits = cities.filter((c) => !needle || c.name.toLowerCase().includes(needle)
      || (c.name_hi ?? '').includes(needle) || (c.state ?? '').toLowerCase().includes(needle));
    const by = new Map<string, PickerCity[]>();
    for (const c of hits) {
      const s = c.state ?? '';
      by.set(s, [...(by.get(s) ?? []), c]);
    }
    return [...by.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [cities, q]);

  function pick(id: string) {
    onPick(id);
    setOpen(false);
    setQ('');
  }

  return (
    <div ref={box} className='relative'>
      <button type='button' onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup='listbox'
              className='flex items-center gap-1.5 rounded-full bg-blue-600 px-3.5 py-1.5 text-sm font-medium text-white shadow hover:bg-blue-500'>
        <Icon name='pin' size={15} />
        {current ? name(current) : labels.pick}
        <svg aria-hidden viewBox='0 0 24 24' className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} fill='none' stroke='currentColor' strokeWidth='2'><path d='m6 9 6 6 6-6' /></svg>
      </button>
      {open && (
        <div className='absolute left-0 top-full z-40 mt-2 w-72 overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/10 motion-safe:animate-[pop_160ms_ease-out] dark:bg-zinc-950 dark:ring-white/10'>
          <div className='border-b border-zinc-200 p-2 dark:border-zinc-800'>
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={labels.search} aria-label={labels.search}
                   className='w-full rounded-lg bg-zinc-100 px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-500 focus:ring-2 focus:ring-blue-500 dark:bg-zinc-900 dark:text-zinc-100' />
          </div>
          <div role='listbox' aria-label={labels.pick} className='max-h-80 overflow-y-auto py-1'>
            {groups.length === 0 && <p className='px-4 py-3 text-sm text-zinc-500'>{labels.none}</p>}
            {groups.map(([state, list]) => (
              <div key={state}>
                {state && <p className='px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500'>{state}</p>}
                {list.map((c) => (
                  <button key={c.id} type='button' role='option' aria-selected={c.id === active} onClick={() => pick(c.id)}
                          className={`flex w-full items-center justify-between px-4 py-1.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-900 ${c.id === active ? 'font-semibold text-blue-600 dark:text-blue-400' : 'text-zinc-800 dark:text-zinc-200'}`}>
                    {name(c)}
                    {c.id === active && <Icon name='check' size={14} />}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
