'use client';
// Bottom dock on the map (Motion Primitives Dock), with text pills instead of icons.
import { Dock, DockItem } from '@/components/core/dock';
import type { ReactNode } from 'react';

export type DockKey = 'home' | 'map' | 'layers' | 'customize' | 'places' | 'tools' | 'theme';

/** Text pill inside a dock item. Accepts (and ignores) the props the Dock passes to children. */
function Pill({ children, active }: { children: ReactNode; active: boolean; width?: unknown; isHovered?: unknown }) {
  return (
    <span className={`flex h-full w-full items-center justify-center whitespace-nowrap rounded-full px-2 text-xs font-medium sm:px-3 sm:text-[13px] transition-colors ${active ? 'bg-blue-600 text-white' : 'bg-neutral-800 text-neutral-200'}`}>
      {children}
    </span>
  );
}

export function MapDock({ items, active, onPick, label, shift = false }: {
  items: { key: DockKey; label: string }[];
  active: DockKey | null;
  onPick: (k: DockKey) => void;
  label: string;
  /** Make room for the place panel on the right (larger screens). */
  shift?: boolean;
}) {
  return (
    <nav aria-label={label} className={`pointer-events-none absolute inset-x-0 bottom-3 z-30 flex justify-center print:hidden ${shift ? 'sm:right-[25rem]' : ''}`}>
      <div className='pointer-events-auto max-w-full'>
        <Dock className='items-end gap-1 bg-neutral-950/90 px-1.5 pb-2 sm:gap-2 sm:px-2 ring-1 ring-white/10 backdrop-blur' magnification={92} panelHeight={52} distance={120}>
          {items.map((it) => (
            <DockItem key={it.key} className='h-9 min-w-[58px] rounded-full sm:min-w-[72px]' onClick={() => onPick(it.key)}>
              <Pill active={active === it.key}>{it.label}</Pill>
            </DockItem>
          ))}
        </Dock>
      </div>
    </nav>
  );
}
