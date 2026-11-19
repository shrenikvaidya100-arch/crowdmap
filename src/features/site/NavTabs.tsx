'use client';
// Site navigation: tabs with the sliding hover background (Motion Primitives
// AnimatedBackground). On phones the tabs fold into a Menu button.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
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
          className='flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-zinc-100 hover:bg-zinc-800'
        >
          <svg aria-hidden viewBox='0 0 24 24' className='h-4 w-4' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round'>
            {open ? <path d='M6 6l12 12M18 6 6 18' /> : <path d='M4 7h16M4 12h16M4 17h16' />}
          </svg>
          {menuLabel}
        </button>
        {open && createPortal(
          <>
            {/* Portal to <body>: the header's backdrop blur would otherwise trap `fixed` inside the small pill. */}
            <div aria-hidden className='fixed inset-0 top-16 z-30 bg-black/40 backdrop-blur-[2px]' onClick={() => setOpen(false)} />
            <nav id='site-menu' aria-label='Main'
                 className='fixed inset-x-0 top-[4.25rem] z-40 flex max-h-[calc(100svh-5rem)] justify-center overflow-y-auto px-4 pb-4'>
              {/* Each page is its own bubble, dropping down one after another. */}
              <ul className='flex w-full max-w-xs flex-col items-stretch gap-2'>
                {items.map((item, i) => (
                  <li key={item.href} className='motion-safe:animate-[bubble_260ms_cubic-bezier(.2,.9,.3,1.2)_both]' style={{ animationDelay: `${i * 35}ms` }}>
                    <Link href={item.href} onClick={() => setOpen(false)} aria-current={item.label === current ? 'page' : undefined}
                          className={`flex min-h-12 items-center justify-center rounded-full px-5 text-[15px] font-medium shadow-lg ring-1 backdrop-blur-xl transition active:scale-95 ${item.label === current ? 'bg-blue-600 text-white ring-blue-400/40' : 'bg-zinc-900/90 text-zinc-100 ring-white/10 hover:bg-zinc-800'}`}>
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </>,
          document.body,
        )}
      </div>
    </>
  );
}
