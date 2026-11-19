'use client';
// Admin controls on the map: clear a place's crowd inputs (recent reports, alerts and
// the people counted there), or delete a single alert pin. Admins must have passed
// the admin check; otherwise the button links to it.
import Link from 'next/link';
import { useState } from 'react';
import { askConfirm } from '@/components/ConfirmDialog';
import { Icon } from '@/components/icons/Icon';
import type { Language } from '@/lib/config';
import { clearPlaceInputs, deleteAlert } from './actions';

type Text = Record<'clear' | 'clearConfirm' | 'clearYes' | 'cleared' | 'delAlert' | 'delConfirm' | 'delYes' | 'deleted' | 'locked' | 'unlock' | 'error' | 'cancel', string>;

const TEXT: Record<'en' | 'hi', Text> = {
  en: {
    clear: 'Admin: clear crowd inputs here',
    clearConfirm: 'Delete the crowd reports from the last 3 hours, the active alerts and the people counted at {name}? This is logged.',
    clearYes: 'Clear',
    cleared: 'Cleared {r} reports, {a} alerts, {p} people.',
    delAlert: 'Admin: delete this alert',
    delConfirm: 'Delete this alert from the map? This is logged.',
    delYes: 'Delete',
    deleted: 'Alert deleted.',
    locked: 'Pass the admin check first.',
    unlock: 'Open admin check',
    error: "Couldn't do that. Try again.",
    cancel: 'Cancel',
  },
  hi: {
    clear: 'एडमिन: यहाँ की भीड़ जानकारी हटाएँ',
    clearConfirm: '{name} की पिछले 3 घंटे की रिपोर्ट, चालू अलर्ट और गिने गए लोग हटाएँ? यह लॉग होगा।',
    clearYes: 'हटाएँ',
    cleared: '{r} रिपोर्ट, {a} अलर्ट, {p} लोग हटाए गए।',
    delAlert: 'एडमिन: यह अलर्ट हटाएँ',
    delConfirm: 'यह अलर्ट मैप से हटाएँ? यह लॉग होगा।',
    delYes: 'हटाएँ',
    deleted: 'अलर्ट हटाया गया।',
    locked: 'पहले एडमिन जाँच पूरी करें।',
    unlock: 'एडमिन जाँच खोलें',
    error: 'नहीं हो सका। फिर कोशिश करें।',
    cancel: 'रद्द करें',
  },
};

function fill(s: string, v: Record<string, string | number>) {
  return s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''));
}

function useAdminAction(lang: Language) {
  const t = TEXT[lang] ?? TEXT.en;
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string; locked?: boolean } | null>(null);
  return { t, busy, note, setNote, setBusy };
}

function Note({ note, t }: { note: { ok: boolean; text: string; locked?: boolean } | null; t: Text }) {
  if (!note) return null;
  return (
    <p role='status' className={`mt-1.5 text-center text-xs ${note.ok ? 'text-emerald-400' : 'text-red-400'}`}>
      {note.text}{' '}
      {note.locked && <Link href='/admin-check' className='font-semibold underline underline-offset-2'>{t.unlock}</Link>}
    </p>
  );
}

const btn = 'flex w-full items-center justify-center gap-1.5 rounded-full bg-red-600/90 px-3.5 py-2 text-xs font-semibold text-white shadow-lg ring-1 ring-red-400/40 hover:bg-red-600 disabled:opacity-50';

export function AdminPlaceClear({ placeId, placeName, lang, onDone }: { placeId: string; placeName: string; lang: Language; onDone: () => void }) {
  const { t, busy, note, setNote, setBusy } = useAdminAction(lang);
  async function run() {
    if (!(await askConfirm(fill(t.clearConfirm, { name: placeName }), { confirmLabel: t.clearYes, cancelLabel: t.cancel }))) return;
    setBusy(true);
    const r = await clearPlaceInputs(placeId);
    setBusy(false);
    if (r.ok) { setNote({ ok: true, text: fill(t.cleared, { r: r.reports ?? 0, a: r.alerts ?? 0, p: r.people ?? 0 }) }); onDone(); }
    else setNote({ ok: false, text: r.reason === 'locked' ? t.locked : t.error, locked: r.reason === 'locked' });
  }
  return (
    <div className='w-[220px] sm:w-[260px]'>
      <button type='button' onClick={run} disabled={busy} className={btn}><Icon name='trash' size={14} />{t.clear}</button>
      <Note note={note} t={t} />
    </div>
  );
}

export function AdminAlertDelete({ alertId, lang, onDone }: { alertId: string; lang: Language; onDone: () => void }) {
  const { t, busy, note, setNote, setBusy } = useAdminAction(lang);
  async function run() {
    if (!(await askConfirm(t.delConfirm, { confirmLabel: t.delYes, cancelLabel: t.cancel }))) return;
    setBusy(true);
    const r = await deleteAlert(alertId);
    setBusy(false);
    if (r.ok) { setNote({ ok: true, text: t.deleted }); onDone(); }
    else setNote({ ok: false, text: r.reason === 'locked' ? t.locked : t.error, locked: r.reason === 'locked' });
  }
  return (
    <div>
      <button type='button' onClick={run} disabled={busy} className={btn}><Icon name='trash' size={14} />{t.delAlert}</button>
      <Note note={note} t={t} />
    </div>
  );
}
