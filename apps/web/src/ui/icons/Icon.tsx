import type { ReactElement } from 'react';
import { DIRECTIONAL, FILLABLE, ICON_PATHS, type IconName } from './icon-paths';

export type { IconName } from './icon-paths';

/** D210: one inline SVG from the icon set; decorative (the control carries the name). */
export function Icon({
  name,
  filled = false,
  className,
}: {
  name: IconName;
  /** Only honoured for fillable icons (e.g. a pressed star). */
  filled?: boolean;
  className?: string;
}): ReactElement {
  const classes = ['icon', DIRECTIONAL.has(name) ? 'icon--directional' : '', className ?? '']
    .filter(Boolean)
    .join(' ');
  return (
    <svg
      className={classes}
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill={filled && FILLABLE.has(name) ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}
