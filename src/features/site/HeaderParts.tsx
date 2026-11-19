'use client';
// Bits of the floating header that depend on the page: the main navigation
// only on the home page, and the spacer that keeps page content below the
// bubbles everywhere except the map (which runs underneath them).
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/icons/Icon';
import { NavTabs, type NavItem } from './NavTabs';

export function HomeNav({ items, menuLabel }: { items: NavItem[]; menuLabel: string }) {
  if (usePathname() !== '/') return null;
  return (
    <div className='pointer-events-auto rounded-full bg-black/70 px-1.5 py-1 shadow-lg ring-1 ring-white/10 backdrop-blur-md'>
      <NavTabs items={items} menuLabel={menuLabel} />
    </div>
  );
}

export function HeaderSpacer() {
  const path = usePathname();
  // These pages draw their own dark hero under the floating header.
  if (['/', '/map', '/community', '/about', '/whats-new', '/getting-started', '/contact'].includes(path)) return null;
  return <div aria-hidden className='h-16 shrink-0' />;
}

/** A map button next to the logo: one tap back to the map from any page. */
export function MapShortcut({ label, className }: { label: string; className: string }) {
  if (usePathname() === '/map') return null;
  return (
    <Link href='/map' aria-label={label} title={label} prefetch
          className={`${className} gap-1.5 px-3 py-2 text-sm font-medium text-zinc-50 transition hover:bg-blue-600`}>
      <Icon name='map' size={17} />
      <span className='hidden sm:inline'>{label}</span>
    </Link>
  );
}
