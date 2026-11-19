'use client';
// Shortcuts on the left of Profile, Settings and Saved places (a row of chips on
// phones): every account page one tap away, with the current one marked.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon, type IconName } from '@/components/icons/Icon';

export type AccountLink = { href: string; label: string; icon: IconName };

export function AccountNav({ links, label }: { links: AccountLink[]; label: string }) {
  const path = usePathname();
  const isOn = (href: string) => {
    const base = href.split('#')[0];
    return href.includes('#') ? false : path === base || (base !== '/' && path.startsWith(`${base}/`));
  };
  return (
    <nav aria-label={label} className='lg:sticky lg:top-20 lg:self-start'>
      <ul className='-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0'>
        {links.map((l) => {
          const on = isOn(l.href);
          return (
            <li key={l.href} className='shrink-0'>
              <Link href={l.href} aria-current={on ? 'page' : undefined}
                    className={`group flex items-center gap-2.5 rounded-full px-3.5 py-2 text-sm font-medium ring-1 transition lg:rounded-xl lg:px-3 lg:ring-0
                                ${on ? 'bg-blue-600 text-white ring-blue-600' : 'bg-white text-zinc-700 ring-zinc-200 hover:bg-zinc-100 hover:text-zinc-900 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-white lg:bg-transparent dark:lg:bg-transparent'}`}>
                <span className={`grid h-7 w-7 place-items-center rounded-lg transition-transform group-hover:scale-110 ${on ? 'bg-white/20' : 'bg-zinc-100 text-blue-600 dark:bg-zinc-800 dark:text-blue-400'}`}>
                  <Icon name={l.icon} size={15} />
                </span>
                {l.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
