'use client';
// Account menu in the header (KokonutUI ProfileDropdown) for signed-in people:
// their name, email and face; Profile, Settings, Saved places, Reminders, Admin
// (admins only), and press-and-hold Sign out.
import { useRouter } from 'next/navigation';
import ProfileDropdown from '@/components/core/profile-dropdown';
import { logout } from '@/app/(auth)/actions';
import { UserAvatar } from '@/features/profile/UserAvatar';

export function AccountMenu({ viewer, labels }: {
  viewer: { id: string; displayName: string; email: string; role: 'user' | 'admin'; avatarSeed: string | null };
  labels: { profile: string; settings: string; saved: string; reminders: string; admin: string; setupAvatar: string };
}) {
  const router = useRouter();
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
    <ProfileDropdown
      accounts={[{
        id: viewer.id, name: viewer.displayName, email: viewer.email, initials,
        avatar: viewer.avatarSeed ? <UserAvatar seed={viewer.avatarSeed} name={viewer.displayName} size={40} className='h-full w-full' /> : undefined,
      }]}
      items={items}
      showStatus={false}
      showTheme={false}
      holdDuration={1200}
      onSignOut={async () => {
        await logout();
        router.push('/');
        router.refresh();
      }}
      triggerClassName='w-auto gap-2 border-zinc-700 bg-zinc-900 p-1 pr-1 text-zinc-100 hover:border-zinc-500 hover:bg-zinc-800 sm:w-56 sm:pr-2.5 [&_[data-identity-text]]:hidden sm:[&_[data-identity-text]]:flex'
    />
  );
}
