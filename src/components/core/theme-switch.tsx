'use client';
/**
 * Theme switch, adapted from KokonutUI Switch Button (@dorianbaffier, MIT,
 * https://kokonutui.com). A track that goes from CrowdMap blue (day) to navy
 * (night); the thumb carries a sun that morphs into a cratered moon. The new
 * theme spreads from the switch as a circle (View Transitions API); without
 * that API, or with reduced motion, it switches instantly.
 *
 * Every part's day look is its base class and its night look a `dark:` class,
 * so the server render matches the client. Clicking animates from the old
 * computed values to the new ones with WAAPI.
 */
import { useId, useRef, useState, useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
import { cn } from '@/lib/utils';

type Theme = 'light' | 'dark';

export interface ThemeSwitchProps {
  /** The theme shown now. */
  theme: Theme;
  /** Called with the theme to switch to. */
  onThemeChange: (theme: Theme) => void;
  labels: { toNight: string; toDay: string; nightOn: string; dayOn: string };
  className?: string;
}

const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';
const EASE_IN_OUT = 'cubic-bezier(0.65, 0, 0.35, 1)';
const EASE_REVEAL = 'cubic-bezier(0.4, 0, 0.2, 1)';
const REVEAL_ATTR = 'data-theme-reveal';
const REVEAL_STYLE_ID = 'theme-switch-reveal';
const REVEAL_CSS = `html[${REVEAL_ATTR}]::view-transition-old(root),html[${REVEAL_ATTR}]::view-transition-new(root){animation:none;mix-blend-mode:normal}`;

const RAYS = [0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
  const rad = (deg * Math.PI) / 180;
  const at = (r: number) => ({
    x: Number((12 + r * Math.cos(rad)).toFixed(2)),
    y: Number((12 + r * Math.sin(rad)).toFixed(2)),
  });
  return { deg, from: at(7.5), to: at(10) };
});
// Craters on the moon, inside the part the bite leaves.
const CRATERS = [
  { cx: 9.2, cy: 13.6, r: 1.5 },
  { cx: 12.6, cy: 17.4, r: 1.05 },
  { cx: 7.6, cy: 9.4, r: 0.85 },
];

const ANIMATED_PROPS = ['opacity', 'scale', 'translate', 'filter', 'background-color'] as const;
type Snapshot = Map<Element, Keyframe>;

function snapshot(elements: Element[]): Snapshot {
  const map: Snapshot = new Map();
  for (const el of elements) {
    const style = getComputedStyle(el);
    const frame: Keyframe = { offset: 0 };
    for (const prop of ANIMATED_PROPS) frame[prop === 'background-color' ? 'backgroundColor' : prop] = style.getPropertyValue(prop);
    map.set(el, frame);
    for (const a of el.getAnimations()) a.cancel();
  }
  return map;
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function timing(el: Element, toDark: boolean): KeyframeAnimationOptions {
  const { part, index = '0' } = (el as HTMLElement | SVGElement).dataset;
  const i = Number(index);
  switch (part) {
    case 'ray':
      return { delay: toDark ? i * 18 : 140 + i * 22, duration: 260, easing: EASE_OUT };
    case 'bite':
      return { delay: toDark ? 60 : 0, duration: 380, easing: EASE_IN_OUT };
    case 'disc':
      return { delay: toDark ? 40 : 0, duration: 380, easing: EASE_OUT };
    case 'crater':
      return { delay: toDark ? 260 + i * 40 : 0, duration: toDark ? 260 : 120, easing: EASE_OUT };
    case 'thumb':
      return { duration: 420, easing: EASE_IN_OUT };
    case 'track':
      return { duration: 420, easing: EASE_OUT };
    default:
      return { duration: 240, easing: EASE_OUT };
  }
}

function morph(from: Snapshot, toDark: boolean) {
  if (reducedMotion()) return;
  for (const [el, frame] of from) el.animate([frame, {}], { ...timing(el, toDark), fill: 'backwards' });
}

let revealRunning = false;
function revealFrom(button: HTMLElement, apply: () => void) {
  const doc = document as Document & { activeViewTransition?: unknown };
  if (typeof doc.startViewTransition !== 'function' || reducedMotion() || revealRunning || doc.activeViewTransition) {
    apply();
    return;
  }
  const rect = button.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  const root = document.documentElement;
  if (!document.getElementById(REVEAL_STYLE_ID)) {
    const style = document.createElement('style');
    style.id = REVEAL_STYLE_ID;
    style.textContent = REVEAL_CSS;
    document.head.appendChild(style);
  }
  root.setAttribute(REVEAL_ATTR, '');
  revealRunning = true;
  let transition: ViewTransition;
  try {
    transition = doc.startViewTransition(() => flushSync(apply));
  } catch {
    root.removeAttribute(REVEAL_ATTR);
    revealRunning = false;
    apply();
    return;
  }
  transition.ready
    .then(() => {
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 500, easing: EASE_REVEAL, pseudoElement: '::view-transition-new(root)' },
      );
    })
    .catch(() => {});
  transition.finished.catch(() => {}).finally(() => {
    root.removeAttribute(REVEAL_ATTR);
    revealRunning = false;
  });
}

const noop = () => () => {};

export default function ThemeSwitch({ theme, onThemeChange, labels, className }: ThemeSwitchProps) {
  const maskId = `${useId()}-moon`;
  const ref = useRef<HTMLButtonElement>(null);
  const [said, setSaid] = useState('');
  // The server can't know the theme; only claim a state once mounted.
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const dark = theme === 'dark';

  const onClick = () => {
    const button = ref.current;
    if (!button) return;
    const next: Theme = dark ? 'light' : 'dark';
    const apply = () => {
      const before = snapshot([...button.querySelectorAll('[data-part]')]);
      // Set the class now: the reveal's snapshot needs it before React re-renders.
      document.documentElement.classList.toggle('dark', next === 'dark');
      document.documentElement.style.colorScheme = next;
      onThemeChange(next);
      setSaid(next === 'dark' ? labels.nightOn : labels.dayOn);
      morph(before, next === 'dark');
    };
    revealFrom(button, apply);
  };

  return (
    <>
      <button
        ref={ref}
        type='button'
        role='switch'
        aria-checked={mounted ? dark : undefined}
        aria-label={!mounted ? labels.toNight : dark ? labels.toDay : labels.toNight}
        title={!mounted ? labels.toNight : dark ? labels.toDay : labels.toNight}
        onClick={onClick}
        className={cn(
          'group/switch relative inline-flex h-7 w-[3.25rem] shrink-0 cursor-crosshair items-center rounded-full p-[3px]',
          'outline-none focus-visible:ring-2 focus-visible:ring-[#0894FF] focus-visible:ring-offset-2 focus-visible:ring-offset-black',
          className,
        )}
      >
        <span
          aria-hidden
          data-part='track'
          className='absolute inset-0 rounded-full bg-[#0894FF] ring-1 ring-inset ring-white/15 dark:bg-[#0b1d3f]'
        />
        <span
          aria-hidden
          data-part='thumb'
          className='relative grid h-[22px] w-[22px] place-items-center rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.35)] dark:translate-x-6 dark:bg-[#dbe4f3]'
        >
          <svg className='pointer-events-none overflow-visible text-[#0894FF] dark:text-[#0b1d3f]' fill='none' height={15} width={15} viewBox='0 0 24 24'>
            <mask id={maskId}>
              <rect fill='white' height='32' width='32' x='-4' y='-4' />
              <circle className='translate-x-[10px] -translate-y-[10px] dark:translate-x-0 dark:translate-y-0' cx='17' cy='7' data-part='bite' fill='black' r='7.5' />
            </mask>
            <g mask={`url(#${maskId})`}>
              <circle className='origin-[12px_12px] [transform-box:view-box] dark:scale-[1.8]' cx='12' cy='12' data-part='disc' fill='currentColor' r='4.75' />
            </g>
            <g fill='#3a5488'>
              {CRATERS.map((c, i) => (
                <circle key={i} {...c} data-part='crater' data-index={i}
                        className='origin-center [transform-box:fill-box] scale-0 opacity-0 dark:scale-100 dark:opacity-100' />
              ))}
            </g>
            <g stroke='currentColor' strokeLinecap='round' strokeWidth='2.4'>
              {RAYS.map((ray, i) => (
                <line key={ray.deg} data-part='ray' data-index={i}
                      className='origin-[12px_12px] [transform-box:view-box] dark:scale-50 dark:opacity-0'
                      x1={ray.from.x} x2={ray.to.x} y1={ray.from.y} y2={ray.to.y} />
              ))}
            </g>
          </svg>
        </span>
      </button>
      <span className='sr-only' aria-live='polite'>{said}</span>
    </>
  );
}
