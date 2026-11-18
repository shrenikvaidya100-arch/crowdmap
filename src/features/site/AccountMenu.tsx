'use client';
// Account menu in the header (KokonutUI ProfileDropdown) for signed-in people:
// their name, email and face; Profile, Settings, Saved places, Reminders, Admin
// (admins only), and Sign out (asks first). Day/night lives in the header only.
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import ProfileDropdown from '@/components/core/profile-dropdown';
import { logout } from '@/app/(auth)/actions';
import { UserAvatar } from '@/features/profile/UserAvatar';

export function AccountMenu({ viewer, labels }: {
  viewer: { id: string; displayName: string; email: string; role: 'user' | 'admin'; avatarSeed: string | null };
  labels: { profile: string; settings: string; saved: string; reminders: string; admin: string; setupAvatar: string; signOutTitle: string; signOutBody: string; signOut: string; cancel: string };
}) {
  const router = useRouter();
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const initials = viewer.displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');
  const items = [
    ...(viewer.avatarSeed ? [] : [{ label: labels.setupAvatar, href: '/welcome?next=%2F' }]),
    { label: labels.profile, href: '/me' },
    { label: labels.settings, href: '/settings' },
    { label: labels.saved, href: '/saved' },
    { label: labels.reminders, href: '/saved#reminders' },
    ...(viewer.role === 'admin' ? [{ label: labels.admin, href: '/admin' }] : []),
  ];
  return (
    <>
    <ProfileDropdown
      accounts={[{
        id: viewer.id, name: viewer.displayName, email: viewer.email, initials,
        avatar: viewer.avatarSeed ? <UserAvatar seed={viewer.avatarSeed} name={viewer.displayName} size={40} className='h-full w-full' /> : undefined,
      }]}
      items={items}
      showStatus={false}
      showTheme={false}
      onSignOut={() => setAsk(true)}
      triggerClassName='w-auto rounded-full border-white/10 bg-black/70 p-1 text-zinc-100 shadow-lg backdrop-blur-md hover:bg-black/80 [&_[data-identity-text]]:hidden'
    />
    <SignOutDialog open={ask} busy={busy} labels={labels}
                   onCancel={() => setAsk(false)}
                   onConfirm={async () => {
                     setBusy(true);
                     await logout();
                     setBusy(false);
                     setAsk(false);
                     router.push('/');
                     router.refresh();
                   }} />
    </>
  );
}

/** "Sign out?" popup (a real modal dialog: focus stays inside, Escape cancels). */
function SignOutDialog({ open, busy, labels, onCancel, onConfirm }: {
  open: boolean; busy: boolean; labels: { signOutTitle: string; signOutBody: string; signOut: string; cancel: string };
  onCancel: () => void; onConfirm: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onCancel={(e) => { e.preventDefault(); onCancel(); }}
            onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
            aria-labelledby='signout-title'
            className='m-auto w-[min(22rem,calc(100%-2rem))] rounded-2xl bg-zinc-950 p-6 text-zinc-100 shadow-2xl ring-1 ring-white/10 backdrop:bg-black/60 backdrop:backdrop-blur-sm'>
      <h2 id='signout-title' className='text-lg font-semibold'>{labels.signOutTitle}</h2>
      <p className='mt-1 text-sm text-zinc-400'>{labels.signOutBody}</p>
      <div className='mt-5 flex justify-end gap-2'>
        <button type='button' onClick={onCancel} className='rounded-lg border border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-900'>{labels.cancel}</button>
        <button type='button' onClick={onConfirm} disabled={busy} autoFocus
                className='rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-60'>{labels.signOut}</button>
      </div>
    </dialog>
  );
}
