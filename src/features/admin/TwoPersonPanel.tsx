'use client';
// Admin: the two-person rule at work. Every place with crowd reports in the last
// few hours, who reported what and when, whether a second person has agreed
// (confirmed) or it's still waiting, how many people nearby were asked, and a
// button that pushes "Is it crowded?" to people near the place right now.
// Refreshes every 5 seconds while open. A test button sends a push to your own devices.
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { Icon } from '@/components/icons/Icon';
import { config } from '@/lib/config';
import { pushConfirm, testPush } from './actions';

export type TwoPersonRow = {
  place_id: string; place: string; city: string | null; people: number;
  status: 'confirmed' | 'waiting' | 'expired'; last_at: string; asked: number; nearby: number;
  entries: { name: string; level: number; at: string; distance_m: number; sample: boolean }[];
};

const LEVEL = ['', 'Empty', 'Quiet', 'Moderate', 'Busy', 'Packed'];
const color = (l: number) => config.crowd.levels.find((x) => x.level === l)?.color ?? config.crowd.noDataColor;
const time = (iso: string) => new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Kolkata' }).format(new Date(iso));
const STATUS = {
  confirmed: { label: 'Confirmed by 2+', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  waiting: { label: 'Waiting for a 2nd person', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  expired: { label: 'Expired (nobody agreed)', cls: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400' },
};

export function TwoPersonPanel({ rows }: { rows: TwoPersonRow[] }) {
  const router = useRouter();
  const [, startRefresh] = useTransition();
  const [note, setNote] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [test, setTest] = useState<string | null>(null);

  // Live: look again every 5 seconds.
  useEffect(() => {
    const id = setInterval(() => startRefresh(() => router.refresh()), 5000);
    return () => clearInterval(id);
  }, [router]);

  async function push(placeId: string) {
    setBusy(placeId);
    const r = await pushConfirm(placeId);
    setBusy(null);
    setNote((n) => ({ ...n, [placeId]: r.ok ? `Asked ${r.asked} ${r.asked === 1 ? 'person' : 'people'} nearby` : r.reason === 'locked' ? 'Pass the admin check first' : "Couldn't send" }));
  }
  async function sendTest() {
    setTest('…');
    const r = await testPush();
    setTest(r.ok ? (r.devices ? `Sent to ${r.devices} device${r.devices === 1 ? '' : 's'}` : 'Saved to your inbox. Turn on notifications on this device to get a push.') : "Couldn't send");
  }

  const waiting = rows.filter((r) => r.status === 'waiting').length;
  const confirmed = rows.filter((r) => r.status === 'confirmed').length;
  return (
    <section className='rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_12px_-4px_rgba(0,0,0,0.06)] dark:border-zinc-800 dark:bg-zinc-950'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div>
          <h2 className='flex items-center gap-2 text-sm font-semibold'>
            <span className='relative flex h-2 w-2'><span className='absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75' /><span className='relative inline-flex h-2 w-2 rounded-full bg-emerald-500' /></span>
            Two-person rule: live entries
          </h2>
          <p className='mt-0.5 text-xs text-zinc-500'>
            Reports from the last 3 hours. A level goes live only when a second person agrees. People nearby are asked every 5 seconds. {confirmed} confirmed · {waiting} waiting.
          </p>
        </div>
        <div className='flex flex-col items-end gap-1'>
          <button type='button' onClick={sendTest}
                  className='inline-flex items-center gap-2 rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-zinc-700 hover:shadow-md active:translate-y-0 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200'>
            <Icon name='phone_notify' size={16} /> Send me a test push
          </button>
          {test && <p role='status' className='text-xs text-zinc-500'>{test}</p>}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className='mt-4 text-sm text-zinc-500'>No crowd reports in the last 3 hours.</p>
      ) : (
        <ul className='mt-4 space-y-3'>
          {rows.map((r) => (
            <li key={r.place_id} className='rounded-xl border border-zinc-200 p-3 dark:border-zinc-800'>
              <div className='flex flex-wrap items-center gap-2'>
                <a href={`/map?place=${r.place_id}`} className='font-medium hover:underline'>{r.place}</a>
                {r.city && <span className='text-xs text-zinc-500'>{r.city}</span>}
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span>
                <span className='ml-auto text-xs text-zinc-500'>{r.nearby} sharing nearby · {r.asked} asked</span>
              </div>
              <ol className='mt-2 grid gap-1.5 sm:grid-cols-2'>
                {r.entries.map((e, i) => (
                  <li key={i} className='flex items-center gap-2 rounded-lg bg-zinc-50 px-2.5 py-1.5 text-sm dark:bg-zinc-900'>
                    <span className='grid h-5 w-5 shrink-0 place-items-center rounded-full bg-zinc-900 text-[10px] font-bold text-white dark:bg-white dark:text-zinc-900'>{i + 1}</span>
                    <span className='min-w-0 flex-1 truncate'>{e.name}{e.sample && ' (sample)'}</span>
                    <span className='flex items-center gap-1 text-xs font-medium'><span className='h-2 w-2 rounded-full' style={{ background: color(e.level) }} />{LEVEL[e.level]}</span>
                    <span className='text-xs tabular-nums text-zinc-500'>{time(e.at)}{e.distance_m ? ` · ${e.distance_m} m` : ''}</span>
                  </li>
                ))}
              </ol>
              {r.status === 'waiting' && (
                <div className='mt-2 flex flex-wrap items-center gap-2'>
                  <button type='button' disabled={busy === r.place_id} onClick={() => push(r.place_id)}
                          className='inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-blue-500 hover:shadow-md active:translate-y-0 disabled:opacity-50'>
                    <Icon name='bell' size={13} /> Push &ldquo;Is it crowded?&rdquo; to people nearby
                  </button>
                  {note[r.place_id] && <span role='status' className='text-xs text-zinc-500'>{note[r.place_id]}</span>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
