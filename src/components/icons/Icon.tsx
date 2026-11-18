// <Icon name="temple" /> renders one of the CrowdMap icons (see icon-data.ts).
// It inherits the text colour, so icons follow the theme and their parent's colour.
import { ICONS, type IconName } from "./icon-data";

export type { IconName };

export function Icon({ name, size = 18, className, title }: {
  name: IconName; size?: number; className?: string;
  /** Accessible name. Without it the icon is decorative and hidden from screen readers. */
  title?: string;
}) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.75}
         strokeLinecap="round" strokeLinejoin="round" className={className}
         role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}
         focusable="false"
         // Static markup from icon-data.ts (our own file), not user input.
         dangerouslySetInnerHTML={{ __html: ICONS[name] }} />
  );
}

/** The same icon as an SVG string, for elements built outside React (map markers). */
export function iconSvg(name: IconName, size = 18) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
}
