'use client';
// Site navigation: tabs with the sliding hover background (Motion Primitives
// AnimatedBackground). On phones the tabs fold into a Menu button.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AnimatedBackground } from '@/components/core/animated-background';

export type NavItem = { label: string; href: string };

export function NavTabs({ items, menuLabel }: { items: NavItem[]; menuLabel: string }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  // Close the phone menu whenever the page changes.
  useEffect(() => { queueMicrotask(() => setOpen(false)); }, [path]);
  const current = items.find((i) => (i.href === '/' ? path === '/' : path.startsWith(i.href)))?.label;

  return (
    <>
      <nav aria-label='Main' className='hidden flex-row md:flex'>
        <AnimatedBackground
          defaultValue={current}
          className='rounded-lg bg-zinc-800'
          transition={{ type: 'spring', bounce: 0.2, duration: 0.3 }}
          enableHover
        >
          {items.map((item) => (
            <Link
              key={item.href}
              data-id={item.label}
              href={item.href}
              aria-current={item.label === current ? 'page' : undefined}
              className={`px-3 py-1.5 text-sm transition-colors duration-300 hover:text-zinc-50 ${item.label === current ? 'text-zinc-50' : 'text-zinc-400'}`}
            >
              {item.label}
            </Link>
          ))}
        </AnimatedBackground>
      </nav>

      <div className='md:hidden'>
        <button
          type='button'
          aria-expanded={open}
          aria-controls='site-menu'
          onClick={() => setOpen((o) => !o)}
          className='rounded-md px-2.5 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800'
        >
          {menuLabel}
        </button>
        {open && (
          <nav id='site-menu' aria-label='Main'
               className='absolute inset-x-0 top-14 z-40 border-b border-zinc-800 bg-zinc-950/95 px-4 py-3 backdrop-blur'>
            <ul className='grid gap-1'>
              {items.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} aria-current={item.label === current ? 'page' : undefined}
                        className={`block rounded-md px-3 py-2 text-sm ${item.label === current ? 'bg-zinc-800 text-zinc-50' : 'text-zinc-300 hover:bg-zinc-900'}`}>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>
    </>
  );
}
