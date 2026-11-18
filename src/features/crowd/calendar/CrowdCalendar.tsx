'use client';
/**
 * Crowd calendar, adapted from KokonutUI Stay Picker (@dorianbaffier, MIT,
 * https://kokonutui.com). Each day shows the expected crowd as a level word in
 * the legend colour. Pick the days you could go (tap or drag across weeks):
 * the window is drawn as one pill and the quietest day in it is named.
 * Past days and days beyond the forecast can't be picked.
 */
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { type KeyboardEvent, type PointerEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { config, type Language } from '@/lib/config';
import { translator } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { messages } from './messages';

export type CalendarDay = {
  date: string;
  level: number;
  quietest: { hour: number; level: number } | null;
  special: { name: string; name_hi: string | null; boost: number }[];
};
export type CalendarData = { from: string; days: CalendarDay[] };

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const DAY_MS = 86_400_000;
/** Height of one week row, in px. The pill is drawn in the same units. */
const ROW = 52;
const ARROW_STEP: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };

/** Days since 1970, so ranges can cross months. */
const dayOf = (y: number, m: number, d: number) => Date.UTC(y, m, d) / DAY_MS;
const dayFromIso = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / DAY_MS;
const levelInfo = (l: number) => config.crowd.levels[Math.min(4, Math.max(0, Math.round(l) - 1))];

interface Segment { row: number; from: number; to: number; roundLeft: boolean; roundRight: boolean }

/** One row of the pill as a clip over a full-width bar, so it animates on the GPU. */
function clipFor(s: Segment) {
  const left = (s.from / 7) * 100;
  const right = 100 - ((s.to + 1) / 7) * 100;
  const l = s.roundLeft ? '22px' : '0px';
  const r = s.roundRight ? '22px' : '0px';
  return `inset(0% ${right}% 0% ${left}% round ${l} ${r} ${r} ${l})`;
}

/** The window, cut into one segment per week row it crosses. */
function segmentsFor(start: number | null, end: number | null, first: number, daysIn: number, lead: number) {
  const segments: Segment[] = [];
  if (start === null || end === null) return segments;
  const a = Math.max(start, first);
  const b = Math.min(end, first + daysIn - 1);
  const ia = a - first + lead;
  const ib = b - first + lead;
  for (let row = Math.floor(ia / 7); a <= b && row <= Math.floor(ib / 7); row++) {
    const from = Math.max(ia, row * 7);
    const to = Math.min(ib, row * 7 + 6);
    segments.push({ row, from: from % 7, to: to % 7, roundLeft: from === ia && a === start, roundRight: to === ib && b === end });
  }
  return segments;
}

export function CrowdCalendar({ data, lang, footer, className }: {
  data: CalendarData;
  lang: Language;
  /** Shown under the summary once a window is picked (the reminder). */
  footer?: ReactNode;
  className?: string;
}) {
  const t = translator(messages, lang);
  const locale = lang === 'hi' ? 'hi-IN' : 'en-IN';
  const today = dayFromIso(data.from);
  const byDay = new Map(data.days.map((d) => [dayFromIso(d.date), d]));
  const lastDay = today + data.days.length - 1;

  const [view, setView] = useState(() => {
    const d = new Date(today * DAY_MS);
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
  });
  const [direction, setDirection] = useState(1);
  const [start, setStart] = useState<number | null>(null);
  const [end, setEnd] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const reduceMotion = Boolean(useReducedMotion());
  const dragging = useRef(false);
  const begunNow = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const noteTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(noteTimer.current), []);

  const fmt = (day: number, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { ...opts, timeZone: 'UTC' }).format(new Date(day * DAY_MS));
  const shortDate = (day: number) => fmt(day, { day: 'numeric', month: 'short' });
  const longDate = (day: number) => fmt(day, { weekday: 'short', day: 'numeric', month: 'short' });
  const hourLabel = (h: number) => new Intl.DateTimeFormat(locale, { hour: 'numeric', hour12: true, timeZone: 'UTC' })
    .format(new Date(Date.UTC(2000, 0, 1, h))).replace(/\s?([ap])\.?m\.?/i, (_, x) => ` ${x.toUpperCase()}M`);
  const levelWord = (l: number) => t(`level.${levelInfo(l).key}`);

  const first = dayOf(view.year, view.month, 1);
  const daysIn = new Date(Date.UTC(view.year, view.month + 1, 0)).getUTCDate();
  const lead = (new Date(first * DAY_MS).getUTCDay() + 6) % 7;
  const rows = Math.ceil((lead + daysIn) / 7);
  const days = Array.from({ length: daysIn }, (_, i) => first + i);
  const weekdays = Array.from({ length: 7 }, (_, i) => fmt(dayOf(2024, 0, 1) + i, { weekday: 'narrow' }));

  const say = (text: string) => {
    setNote(text);
    clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(null), 2600);
  };
  const pickable = (day: number) => byDay.has(day);
  const refuse = (day: number) => say(day < today ? t('pastNote') : t('noForecastNote', { day: shortDate(day) }));
  /** Where a window from `from` ends if you aim for `to`: never past the forecast. */
  const settle = (to: number) => {
    if (to <= lastDay) return to;
    say(t('endsNote', { day: shortDate(lastDay) }));
    return lastDay;
  };

  const picking = start !== null && end === null;
  const shownEnd = picking && hover !== null && hover >= start ? Math.min(hover, lastDay) : end;

  const begin = (day: number) => {
    if (!pickable(day)) { refuse(day); return; }
    setStart(day);
    setEnd(null);
  };
  const choose = (day: number) => {
    if (start === null || end !== null || day < start) { begin(day); return; }
    setEnd(settle(day));
    setHover(null);
  };
  const clear = () => { setStart(null); setEnd(null); setHover(null); };

  const dayAt = (event: PointerEvent) => {
    const el = document.elementFromPoint(event.clientX, event.clientY);
    const cell = el?.closest<HTMLElement>('[data-day]');
    return cell ? Number(cell.dataset.day) : null;
  };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const day = dayAt(event);
    if (day === null) return;
    dragging.current = true;
    // A press on a fresh day starts a window; a press while picking ends one on release.
    begunNow.current = start === null || end !== null || day < start;
    if (begunNow.current) begin(day);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const day = dayAt(event);
    if (day !== null && picking) setHover(day);
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    const day = dayAt(event);
    // A drag ends the window where you let go; tapping the first day again makes it one day.
    if (day !== null && start !== null && end === null && (day > start || (day === start && !begunNow.current))) choose(day);
  };

  const go = (delta: number) => {
    setDirection(delta);
    setView(({ year, month }) => {
      const m = month + delta;
      return { year: year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 };
    });
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, day: number) => {
    if (event.key in ARROW_STEP) {
      event.preventDefault();
      const next = day + ARROW_STEP[event.key];
      const focusDay = () => rootRef.current?.querySelector<HTMLElement>(`[data-day="${next}"]`)?.focus();
      if (next < first || next >= first + daysIn) {
        go(next < first ? -1 : 1);
        requestAnimationFrame(focusDay);
      } else focusDay();
      if (picking) setHover(next);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      choose(day);
    }
  };

  // The quietest day in the window (ties go to the earlier day).
  const windowDays = start !== null && end !== null
    ? Array.from({ length: end - start + 1 }, (_, i) => byDay.get(start + i)).filter(Boolean) as CalendarDay[]
    : [];
  const best = windowDays.reduce<CalendarDay | null>((b, d) => (!b || d.level < b.level ? d : b), null);

  const summary = start === null ? t('pickStart')
    : end === null ? t('pickEnd', { from: shortDate(start) })
    : end === start ? t('oneDay', { day: longDate(start) })
    : t('window', { from: shortDate(start), to: shortDate(end), n: end - start + 1 });

  const segments = segmentsFor(start, shownEnd ?? null, first, daysIn, lead);
  const spring = reduceMotion ? { duration: 0 } : { type: 'spring' as const, duration: 0.35, bounce: 0 };
  const fade = { duration: reduceMotion ? 0 : 0.18, ease: EASE_OUT };
  const tabDay = start !== null && start >= first && start < first + daysIn ? start
    : today >= first && today < first + daysIn ? today : first;
  const navButton = 'h-8 rounded-full px-3 text-xs font-medium text-zinc-600 outline-none transition-colors duration-150 hover:bg-zinc-100 hover:text-zinc-900 focus-visible:ring-2 focus-visible:ring-[#0894FF] dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100';

  return (
    <div ref={rootRef} className={cn('w-full select-none rounded-3xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950', className)}>
      <div className='flex items-center justify-between gap-2 px-1'>
        <div className='relative h-5 flex-1 overflow-hidden'>
          <AnimatePresence custom={direction} initial={false} mode='popLayout'>
            <motion.p key={`${view.year}-${view.month}`} className='text-sm font-medium text-zinc-900 dark:text-zinc-100'
                      initial={{ opacity: 0, x: 12 * direction }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 * direction }} transition={fade}>
              {fmt(first, { month: 'long', year: 'numeric' })}
            </motion.p>
          </AnimatePresence>
        </div>
        <div className='flex gap-1'>
          <button type='button' className={navButton} onClick={() => go(-1)}>{t('prev')}</button>
          <button type='button' className={navButton} onClick={() => go(1)}>{t('next')}</button>
        </div>
      </div>

      <div aria-hidden className='mt-3 grid grid-cols-7 text-center text-[11px] text-zinc-400 dark:text-zinc-500'>
        {weekdays.map((d, i) => <span key={i}>{d}</span>)}
      </div>

      <AnimatePresence custom={direction} initial={false} mode='popLayout'>
        <motion.div key={`${view.year}-${view.month}`} className='mt-1'
                    initial={{ opacity: 0, x: 16 * direction }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 * direction }} transition={fade}>
          <div className='relative touch-none' style={{ height: rows * ROW }}
               onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
               onPointerLeave={() => setHover(null)} onPointerCancel={() => { dragging.current = false; }}>
            {segments.map((s) => (
              <motion.div key={s.row} aria-hidden
                          className={cn('pointer-events-none absolute inset-x-0 h-11 bg-[#0894FF]/12 dark:bg-[#0894FF]/20', picking && 'bg-[#0894FF]/8 dark:bg-[#0894FF]/12')}
                          style={{ top: s.row * ROW + (ROW - 44) / 2 }}
                          initial={{ clipPath: clipFor({ ...s, to: s.from, roundLeft: true, roundRight: true }), opacity: 0 }}
                          animate={{ clipPath: clipFor(s), opacity: 1 }}
                          transition={{ ...spring, opacity: fade }} />
            ))}
            {days.map((day, i) => {
              const info = byDay.get(day);
              const past = day < today;
              const edge = day === start || day === end || (day === shownEnd && !picking);
              const isBest = !!best && dayFromIso(best.date) === day;
              const cell = i + lead;
              const lvl = info ? levelInfo(info.level) : null;
              const label = past ? `${longDate(day)}, ${t('past')}`
                : info ? `${longDate(day)}, ${levelWord(info.level)}${info.special.length ? `, ${info.special.map((s) => (lang === 'hi' && s.name_hi) || s.name).join(', ')}` : ''}`
                : `${longDate(day)}, ${t('noForecast')}`;
              return (
                <button key={day} type='button' data-day={day} aria-label={label} aria-pressed={edge} aria-disabled={!info}
                        tabIndex={day === tabDay ? 0 : -1} onKeyDown={(e) => onKeyDown(e, day)}
                        className='group absolute flex flex-col items-center justify-center outline-none'
                        style={{ left: `${((cell % 7) / 7) * 100}%`, top: Math.floor(cell / 7) * ROW, width: `${100 / 7}%`, height: ROW }}>
                  <span className={cn(
                    'relative flex size-11 flex-col items-center justify-center rounded-full leading-none transition-colors duration-150',
                    'group-focus-visible:ring-2 group-focus-visible:ring-[#0894FF]',
                    edge && 'bg-[#0894FF] text-white',
                    !edge && picking && day === shownEnd && 'ring-1 ring-inset ring-[#0894FF]',
                    !edge && info && 'group-hover:bg-zinc-100 dark:group-hover:bg-zinc-900',
                  )}>
                    {isBest && !edge && <span aria-hidden className='absolute inset-0.5 rounded-full ring-1 ring-inset ring-[#0894FF]/70' />}
                    <span className={cn('relative text-[13px] font-medium tabular-nums',
                      edge ? 'text-white' : info ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-400 dark:text-zinc-600',
                      past && !edge && 'line-through decoration-zinc-300 dark:decoration-zinc-700')}>
                      {i + 1}
                    </span>
                    {info && lvl && (
                      <span className={cn('relative mt-1 max-w-[42px] truncate text-[9px] font-medium', edge && 'text-white/90')}
                            style={edge ? undefined : { color: lvl.color }}>
                        {levelWord(info.level)}
                      </span>
                    )}
                    {info && info.special.length > 0 && !edge && (
                      <span aria-hidden className='absolute right-1.5 top-1.5 h-1 w-1 rounded-full bg-zinc-500 dark:bg-zinc-400' />
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </motion.div>
      </AnimatePresence>

      <div aria-live='polite' className='relative mt-2 min-h-4 px-1 text-xs'>
        <AnimatePresence initial={false} mode='popLayout'>
          <motion.p key={note ?? summary} className={note ? 'text-orange-600 dark:text-orange-400' : 'text-zinc-500 dark:text-zinc-400'}
                    initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={fade}>
            {note ?? summary}
          </motion.p>
        </AnimatePresence>
      </div>

      <div className='mt-3 flex items-center justify-between gap-3 border-t border-zinc-100 px-1 pt-3 dark:border-zinc-900'>
        <div className='min-w-0 leading-tight'>
          <p className='text-xs text-zinc-500 dark:text-zinc-400'>{t('best')}</p>
          <div className='relative min-h-6 overflow-hidden'>
            <AnimatePresence initial={false} mode='popLayout'>
              <motion.p key={best?.date ?? 'none'} className='text-sm font-semibold text-zinc-900 dark:text-zinc-50'
                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={fade}>
                {best ? (best.quietest
                  ? t('bestValue', { day: longDate(dayFromIso(best.date)), level: levelWord(best.level), hour: hourLabel(best.quietest.hour) })
                  : `${longDate(dayFromIso(best.date))}, ${levelWord(best.level)}`) : '-'}
              </motion.p>
            </AnimatePresence>
          </div>
        </div>
        <button type='button' onClick={clear} disabled={start === null}
                className='h-9 shrink-0 rounded-full border border-zinc-200 px-4 text-xs font-medium text-zinc-700 outline-none transition-colors hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-[#0894FF] disabled:opacity-40 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900'>
          {t('clear')}
        </button>
      </div>

      <ul aria-hidden className='mt-3 flex flex-wrap gap-x-3 gap-y-1 px-1 text-[11px] text-zinc-500 dark:text-zinc-400'>
        {config.crowd.levels.map((l) => (
          <li key={l.key} className='flex items-center gap-1.5'>
            <span className='h-2 w-2 rounded-full' style={{ background: l.color }} />{t(`level.${l.key}`)}
          </li>
        ))}
      </ul>

      {best && footer && <div className='mt-3 border-t border-zinc-100 px-1 pt-3 dark:border-zinc-900'>{footer}</div>}
    </div>
  );
}

/** Loads the calendar for one place and shows it, with the reminder under it. */
export function PlaceCalendar({ placeId, lang, footer, className }: { placeId: string; lang: Language; footer?: ReactNode; className?: string }) {
  const t = translator(messages, lang);
  const [data, setData] = useState<CalendarData | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/places/${placeId}/calendar`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: CalendarData) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [placeId]);
  return (
    <section>
      <h3 className='text-sm font-medium'>{t('title')}</h3>
      <p className='mb-2 text-xs text-zinc-500 dark:text-zinc-400'>{t('hint')}</p>
      {failed ? <p className='text-sm text-red-600'>{t('error')}</p>
        : !data ? <p className='h-24 text-sm text-zinc-500'>{t('loading')}</p>
        : <CrowdCalendar data={data} lang={lang} footer={footer} className={className} />}
    </section>
  );
}
