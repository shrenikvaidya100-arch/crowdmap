'use client';
// Bottom dock on the map (Motion Primitives Dock), with text pills instead of icons.
import { Dock, DockItem } from '@/components/core/dock';
import type { ReactNode } from 'react';

export type DockKey = 'home' | 'map' | 'layers' | 'customize' | 'places' | 'tools' | 'theme';

/** Text pill inside a dock item. Accepts (and ignores) the props the Dock passes to children. */
function Pill({ children, active }: { children: ReactNode; active: boolean; width?: unknown; isHovered?: unknown }) {
  return (
    <span className={`flex h-full w-full items-center justify-center whitespace-nowrap rounded-full px-3 text-[13px] font-medium transition-colors ${active ? 'bg-blue-600 text-white' : 'bg-neutral-800 text-neutral-200'}`}>
      {children}
    </span>
  );
}

export function MapDock({ items, active, onPick, label }: {
  items: { key: DockKey; label: string }[];
  active: DockKey | null;
  onPick: (k: DockKey) => void;
  label: string;
}) {
  return (
    <nav aria-label={label} className='pointer-events-none absolute inset-x-0 bottom-3 z-30 flex justify-center print:hidden'>
      <div className='pointer-events-auto max-w-full'>
        <Dock className='items-end gap-2 bg-neutral-950/90 px-2 pb-2 ring-1 ring-white/10 backdrop-blur' magnification={92} panelHeight={52} distance={120}>
          {items.map((it) => (
            <DockItem key={it.key} className='h-9 min-w-[72px] rounded-full' onClick={() => onPick(it.key)}>
              <Pill active={active === it.key}>{it.label}</Pill>
            </DockItem>
          ))}
        </Dock>
      </div>
    </nav>
  );
}
