'use client';
import { Icon } from '@/components/icons/Icon';
// The four map panels opened from the dock: Layers, Customize, Places, Tools.
// Plain text labels throughout (design brief), switches are real role="switch".
import { useState, type ReactNode } from 'react';
import type { Language } from '@/lib/config';
import { translator } from '@/lib/i18n';
import { BASEMAPS, OVERLAYS, mapTilerKey, type BasemapId, type OverlayId } from '../basemaps';
import { pathKm, type MapPrefs } from '../mapLayers';
import { messages } from './messages';
import { MARKER_COLORS, type Shape, type UserMarker } from './store';

type T = ReturnType<typeof translator>;

export function Panel({ title, onClose, closeLabel, children }: { title: string; onClose: () => void; closeLabel: string; children: ReactNode }) {
  return (
    <section aria-label={title}
             className='absolute inset-x-0 bottom-0 z-40 max-h-[70%] overflow-y-auto rounded-t-2xl bg-neutral-950/95 p-4 text-sm text-neutral-200 shadow-2xl ring-1 ring-white/10 backdrop-blur sm:inset-x-0 sm:bottom-24 sm:mx-auto sm:max-h-[calc(100%-9.5rem)] sm:w-[360px] sm:rounded-2xl motion-safe:animate-[pop_180ms_ease-out]'>
      <div className='mb-3 flex items-center justify-between'>
        <h2 className='text-base font-semibold text-white'>{title}</h2>
        <button type='button' onClick={onClose} aria-label={closeLabel} title={closeLabel} className='grid h-8 w-8 place-items-center rounded-full text-neutral-400 hover:bg-neutral-800 hover:text-white'><Icon name='close' size={16} /></button>
      </div>
      <div className='space-y-5'>{children}</div>
    </section>
  );
}

function Switch({ on, onChange, label, disabled, note }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; note?: string }) {
  return (
    <div className='flex items-center justify-between gap-3'>
      <span className={disabled ? 'text-neutral-500' : ''}>
        {label}
        {note && <span className='block text-xs text-neutral-500'>{note}</span>}
      </span>
      <button type='button' role='switch' aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-40 ${on ? 'bg-blue-600' : 'bg-neutral-700'}`}>
        <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange, format }: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format?: (v: number) => string;
}) {
  return (
    <label className='block'>
      <span className='flex justify-between text-xs text-neutral-400'><span>{label}</span><span className='tabular-nums'>{format ? format(value) : value}</span></span>
      <input type='range' min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))}
             className='mt-1.5 w-full accent-blue-500' />
    </label>
  );
}

const heading = 'mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500';
const chip = (on: boolean) => `rounded-lg px-3 py-2 text-left text-sm ${on ? 'bg-blue-600 text-white' : 'bg-neutral-900 text-neutral-200 hover:bg-neutral-800'} disabled:cursor-not-allowed disabled:opacity-40`;

// ---- Layers ------------------------------------------------------------------
export function LayersPanel({ lang, basemap, onBasemap, overlays, onOverlay, onClose }: {
  lang: Language; basemap: BasemapId; onBasemap: (b: BasemapId) => void;
  overlays: Record<OverlayId, boolean>; onOverlay: (id: OverlayId, on: boolean) => void; onClose: () => void;
}) {
  const t = translator(messages, lang);
  const hasKey = !!mapTilerKey();
  return (
    <Panel title={t('dock.layers')} onClose={onClose} closeLabel={t('close')}>
      <div>
        <h3 className={heading}>{t('mapType')}</h3>
        <div className='grid grid-cols-2 gap-1.5'>
          {BASEMAPS.map((b) => (
            <button key={b.id} type='button' aria-pressed={basemap === b.id} disabled={b.needsKey && !hasKey}
                    onClick={() => onBasemap(b.id)} className={`${chip(basemap === b.id)} ${b.id === 'satellite' ? 'col-span-2' : ''}`}>
              {t(`base.${b.id}`)}
              {b.needsKey && !hasKey && <span className='block text-[11px] text-neutral-500'>{t('needsKey')}</span>}
            </button>
          ))}
        </div>
        {basemap === '3d' && <p className='mt-2 text-xs text-neutral-500'>{t('3dHint')}</p>}
      </div>
      <div>
        <h3 className={heading}>{t('overlays')}</h3>
        <div className='space-y-2.5'>
          {OVERLAYS.map((o) => (
            <Switch key={o.id} label={t(`ov.${o.id}`)} on={overlays[o.id]} onChange={(v) => onOverlay(o.id, v)}
                    disabled={(o.needsKey && !hasKey) || o.unavailable}
                    note={o.unavailable ? t('trafficUnavailable') : o.needsKey && !hasKey ? t('needsKey') : undefined} />
          ))}
        </div>
      </div>
    </Panel>
  );
}

// ---- Customize ---------------------------------------------------------------
export function CustomizePanel({ lang, prefs, onPrefs, onSave, onReset, onClose, contoursOn, siteTheme, onTheme }: {
  lang: Language; prefs: MapPrefs; onPrefs: (p: Partial<MapPrefs>) => void; onSave: () => void; onReset: () => void;
  onClose: () => void; contoursOn: boolean;
  /** The whole site's day/night; the button switches it (and the map) to the other one. */
  siteTheme: 'light' | 'dark'; onTheme: (t: 'light' | 'dark') => void;
}) {
  const t = translator(messages, lang);
  const [note, setNote] = useState<string | null>(null);
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  return (
    <Panel title={t('dock.customize')} onClose={onClose} closeLabel={t('close')}>
      <div>
        <h3 className={heading}>{t('palette')}</h3>
        {/* One day/night button: it names what it switches to, for the whole site. */}
        {(() => {
          const next = siteTheme === 'dark' ? 'light' : 'dark';
          return (
            <button type='button' onClick={() => onTheme(next)} aria-label={t(`palette.${next}`)}
                    className={`mb-1.5 flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${next === 'light'
                      ? 'bg-white text-neutral-900 hover:bg-neutral-200' : 'bg-neutral-800 text-white ring-1 ring-white/15 hover:bg-neutral-700'}`}>
              <Icon name={next === 'light' ? 'sun' : 'moon'} size={16} />{t(`palette.${next}`)}
            </button>
          );
        })()}
        <div className='grid grid-cols-2 gap-1.5'>
          {(['sepia', 'contrast'] as const).map((p) => (
            <button key={p} type='button' aria-pressed={prefs.palette === p} onClick={() => onPrefs({ palette: p })} className={chip(prefs.palette === p)}>
              {t(`palette.${p}`)}
            </button>
          ))}
        </div>
      </div>
      <div className='space-y-3'>
        <Slider label={t('labelSize')} value={prefs.labelScale} min={0.8} max={1.6} step={0.1} onChange={(v) => onPrefs({ labelScale: v })} format={pct} />
        <Slider label={t('markerSize')} value={prefs.markerScale} min={0.6} max={1.8} step={0.1} onChange={(v) => onPrefs({ markerScale: v })} format={pct} />
        <Slider label={t('crowdOpacity')} value={prefs.crowdOpacity} min={0.3} max={1} step={0.05} onChange={(v) => onPrefs({ crowdOpacity: v })} format={pct} />
        {contoursOn && <Slider label={t('contoursOpacity')} value={prefs.contoursOpacity} min={0.2} max={1} step={0.05} onChange={(v) => onPrefs({ contoursOpacity: v })} format={pct} />}
        <Slider label={t('lineWidth')} value={prefs.lineWidth} min={1} max={8} step={1} onChange={(v) => onPrefs({ lineWidth: v })} format={(v) => `${v} px`} />
      </div>
      <div>
        <h3 className={heading}>{t('drawColor')}</h3>
        <ColorPicker value={prefs.drawColor} onChange={(c) => onPrefs({ drawColor: c })} label={t('drawColor')} />
      </div>
      <div className='flex flex-wrap items-center gap-2'>
        <button type='button' onClick={() => { onSave(); setNote(t('saved')); }} className='rounded-lg bg-blue-600 px-3 py-2 font-medium text-white hover:bg-blue-500'>{t('saveStyle')}</button>
        <button type='button' onClick={() => { onReset(); setNote(t('resetDone')); }} className='rounded-lg px-3 py-2 text-neutral-300 hover:bg-neutral-800'>{t('reset')}</button>
        {note && <p role='status' className='w-full text-xs text-neutral-400'>{note}</p>}
      </div>
    </Panel>
  );
}

function ColorPicker({ value, onChange, label }: { value: string; onChange: (c: string) => void; label: string }) {
  return (
    <div role='radiogroup' aria-label={label} className='flex flex-wrap items-center gap-2'>
      {MARKER_COLORS.map((c) => (
        <button key={c} type='button' role='radio' aria-checked={value === c} aria-label={c} onClick={() => onChange(c)}
                className={`h-7 w-7 rounded-full ring-offset-2 ring-offset-neutral-950 ${value === c ? 'ring-2 ring-white' : ''}`}
                style={{ background: c }} />
      ))}
      <input type='color' value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}
             className='h-7 w-9 cursor-crosshair rounded border-0 bg-transparent p-0' />
    </div>
  );
}

// ---- Places ------------------------------------------------------------------
export function PlacesPanel({ lang, markers, onOpen, onDelete, onClose }: {
  lang: Language; markers: UserMarker[]; onOpen: (m: UserMarker) => void; onDelete: (id: string) => void; onClose: () => void;
}) {
  const t = translator(messages, lang);
  return (
    <Panel title={t('dock.places')} onClose={onClose} closeLabel={t('close')}>
      <div>
        <h3 className={heading}>{t('yourMarkers')}</h3>
        {markers.length === 0 ? <p className='text-neutral-400'>{t('noMarkers')}</p> : (
          <ul className='divide-y divide-neutral-800 rounded-lg ring-1 ring-neutral-800'>
            {markers.map((m) => (
              <li key={m.id} className='flex items-center gap-3 px-3 py-2'>
                <span className='h-3 w-3 shrink-0 rounded-full' style={{ background: m.color }} />
                <span className='min-w-0 flex-1'>
                  <span className='block truncate text-neutral-100'>{m.name || t('unnamed')}</span>
                  <a href={`https://www.openstreetmap.org/?mlat=${m.lat}&mlon=${m.lng}#map=17/${m.lat}/${m.lng}`} target='_blank' rel='noopener noreferrer'
                     className='text-xs text-blue-400 hover:underline'>{t('openOsm')}</a>
                </span>
                <button type='button' onClick={() => onOpen(m)} className='rounded-md px-2 py-1 text-xs hover:bg-neutral-800'>{t('open')}</button>
                <button type='button' onClick={() => onDelete(m.id)} className='rounded-md px-2 py-1 text-xs text-red-400 hover:bg-neutral-800'>{t('delete')}</button>
              </li>
            ))}
          </ul>
        )}
        <p className='mt-2 text-xs text-neutral-500'>{t('markersNote')}</p>
      </div>
      <div>
        <h3 className={heading}>{t('savedPlaces')}</h3>
        <a href='/saved' className='text-blue-400 hover:underline'>{t('savedLink')}</a>
      </div>
    </Panel>
  );
}

/** Small form shown where the viewer clicked, to name and colour a new marker. */
export function NewMarkerForm({ lang, color, onSave, onCancel }: {
  lang: Language; color: string; onSave: (name: string, color: string) => void; onCancel: () => void;
}) {
  const t = translator(messages, lang);
  const [name, setName] = useState('');
  const [c, setC] = useState(color);
  return (
    <div className='w-64 space-y-2.5 rounded-xl bg-neutral-950 p-3 text-sm text-neutral-200 shadow-2xl ring-1 ring-white/10'>
      <p className='font-medium text-white'>{t('markerHere')}</p>
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder={t('name')} aria-label={t('name')}
             onKeyDown={(e) => { if (e.key === 'Enter') onSave(name.trim(), c); if (e.key === 'Escape') onCancel(); }}
             className='w-full rounded-md bg-neutral-900 px-2.5 py-1.5 text-neutral-100 outline-none ring-1 ring-neutral-700 focus:ring-blue-500' />
      <ColorPicker value={c} onChange={setC} label={t('color')} />
      <div className='flex gap-2'>
        <button type='button' onClick={() => onSave(name.trim(), c)} className='rounded-md bg-blue-600 px-3 py-1.5 font-medium text-white hover:bg-blue-500'>{t('save')}</button>
        <button type='button' onClick={onCancel} className='rounded-md px-3 py-1.5 text-neutral-300 hover:bg-neutral-800'>{t('cancel')}</button>
      </div>
    </div>
  );
}

// ---- Tools -------------------------------------------------------------------
export type ToolMode = null | 'measure' | 'point' | 'line' | 'area';

export function ToolsPanel({ lang, mode, onMode, measurePts, onClearMeasure, drawPts, onFinishDraw, shapes, onDeleteShape,
  onExport, onShare, onPrint, onClose }: {
  lang: Language; mode: ToolMode; onMode: (m: ToolMode) => void;
  measurePts: [number, number][]; onClearMeasure: () => void;
  drawPts: [number, number][]; onFinishDraw: (name: string) => void;
  shapes: Shape[]; onDeleteShape: (id: string) => void;
  onExport: () => void; onShare: () => Promise<boolean>; onPrint: () => void; onClose: () => void;
}) {
  const t = translator(messages, lang);
  const [copied, setCopied] = useState(false);
  const [shapeName, setShapeName] = useState('');
  const km = pathKm(measurePts);
  const canFinish = mode === 'point' ? drawPts.length >= 1 : mode === 'line' ? drawPts.length >= 2 : mode === 'area' ? drawPts.length >= 3 : false;
  const action = 'rounded-lg bg-neutral-900 px-3 py-2 text-left hover:bg-neutral-800';
  return (
    <Panel title={t('dock.tools')} onClose={onClose} closeLabel={t('close')}>
      <div>
        <h3 className={heading}>{t('measure')}</h3>
        {mode === 'measure' ? (
          <div className='space-y-2'>
            <p>{t('measureHint')} <strong className='text-white tabular-nums'>{km.toFixed(2)} km</strong> <span className='text-neutral-400 tabular-nums'>({(km * 0.621371).toFixed(2)} mi)</span></p>
            <div className='flex gap-2'>
              <button type='button' onClick={onClearMeasure} className={action}>{t('clear')}</button>
              <button type='button' onClick={() => onMode(null)} className='rounded-lg bg-blue-600 px-3 py-2 font-medium text-white'>{t('measureDone')}</button>
            </div>
          </div>
        ) : (
          <button type='button' onClick={() => onMode('measure')} className={action}>{t('measure')}</button>
        )}
      </div>

      <div>
        <h3 className={heading}>{t('draw')}</h3>
        <div className='grid grid-cols-3 gap-1.5'>
          {(['point', 'line', 'area'] as const).map((k) => (
            <button key={k} type='button' aria-pressed={mode === k} onClick={() => onMode(mode === k ? null : k)} className={chip(mode === k)}>{t(`draw.${k}`)}</button>
          ))}
        </div>
        {(mode === 'point' || mode === 'line' || mode === 'area') && (
          <div className='mt-2 space-y-2'>
            <p className='text-xs text-neutral-400'>{t('drawHint')}</p>
            <input value={shapeName} onChange={(e) => setShapeName(e.target.value)} maxLength={60} placeholder={t('name')} aria-label={t('name')}
                   className='w-full rounded-md bg-neutral-900 px-2.5 py-1.5 text-neutral-100 outline-none ring-1 ring-neutral-700 focus:ring-blue-500' />
            <button type='button' disabled={!canFinish} onClick={() => { onFinishDraw(shapeName.trim()); setShapeName(''); }}
                    className='rounded-lg bg-blue-600 px-3 py-2 font-medium text-white disabled:opacity-40'>{t('finish')}</button>
          </div>
        )}
        {shapes.length > 0 && (
          <ul className='mt-3 divide-y divide-neutral-800 rounded-lg ring-1 ring-neutral-800'>
            {shapes.map((s) => (
              <li key={s.id} className='flex items-center gap-3 px-3 py-2'>
                <span className='h-3 w-3 shrink-0 rounded-sm' style={{ background: s.color }} />
                <span className='min-w-0 flex-1 truncate'>{s.name || t(`draw.${s.kind}`)}
                  {s.kind === 'line' && <span className='ml-1 text-xs text-neutral-500'>{pathKm(s.coords).toFixed(2)} km</span>}
                </span>
                <button type='button' onClick={() => onDeleteShape(s.id)} className='rounded-md px-2 py-1 text-xs text-red-400 hover:bg-neutral-800'>{t('delete')}</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className='grid gap-1.5'>
        <button type='button' onClick={onExport} className={action}>{t('export')}</button>
        <button type='button' onClick={async () => { setCopied(await onShare()); }} className={action}>{copied ? t('copied') : t('share')}</button>
        <button type='button' onClick={onPrint} className={action}>{t('print')}</button>
      </div>

      <div>
        <h3 className={heading}>{t('shortcuts')}</h3>
        <dl className='grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs'>
          {[['A–Z, 0–9', 'key.search'], ['+  -', 'key.zoom'], ['Arrow keys', 'key.pan'], ['Alt + L', 'key.layers'], ['Alt + T', 'key.tools'], ['Esc', 'key.esc']].map(([k, d]) => (
            <div key={d} className='contents'>
              <dt><kbd className='rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-neutral-200'>{k}</kbd></dt>
              <dd className='text-neutral-400'>{t(d)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Panel>
  );
}

export type { T };
