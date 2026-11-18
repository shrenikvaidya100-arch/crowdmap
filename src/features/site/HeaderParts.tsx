'use client';
// Bits of the floating header that depend on the page: the main navigation
// only on the home page, and the spacer that keeps page content below the
// bubbles everywhere except the map (which runs underneath them).
import { usePathname } from 'next/navigation';
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
  if (path === '/map' || path === '/') return null;
  return <div aria-hidden className='h-16 shrink-0' />;
}
