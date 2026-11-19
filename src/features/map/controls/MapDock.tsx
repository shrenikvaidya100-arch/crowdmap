'use client';
// Bottom dock on the map (Motion Primitives Dock) with our icons. The name
// shows as a tooltip and is the button's accessible name.
import { Dock, DockIcon, DockItem, DockLabel } from '@/components/core/dock';
import { Icon, type IconName } from '@/components/icons/Icon';

export type DockKey = 'layers' | 'customize' | 'places' | 'tools';

const ICON: Record<DockKey, IconName> = { layers: 'layers', customize: 'settings', places: 'pin', tools: 'ruler' };

export function MapDock({ items, active, onPick, label, shift = false }: {
  items: { key: DockKey; label: string }[];
  active: DockKey | null;
  onPick: (k: DockKey) => void;
  label: string;
  /** Make room for the place panel on the right (larger screens). */
  shift?: boolean;
}) {
  return (
    <nav data-no-hover aria-label={label} className={`pointer-events-none absolute inset-x-0 bottom-3 z-30 flex justify-center print:hidden ${shift ? 'sm:right-[25rem]' : ''}`}>
      <div className='pointer-events-auto max-w-full'>
        <Dock className='items-end gap-2 bg-neutral-950/90 px-2 pb-2 ring-1 ring-white/10 backdrop-blur' magnification={64} panelHeight={56} distance={110}>
          {items.map((it) => (
            <DockItem key={it.key} aria-label={it.label} aria-pressed={active === it.key} onClick={() => onPick(it.key)}
                      className={`aspect-square rounded-full transition-colors ${active === it.key ? 'bg-blue-600 text-white' : 'bg-neutral-800 text-neutral-200'}`}>
              <DockLabel>{it.label}</DockLabel>
              <DockIcon><Icon name={ICON[it.key]} size={20} /></DockIcon>
            </DockItem>
          ))}
        </Dock>
      </div>
    </nav>
  );
}
