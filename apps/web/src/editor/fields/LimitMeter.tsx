import type { ReactElement } from 'react';

/** Above this share of the limit the meter is announced (contracts/editor-ui.md). */
const ANNOUNCE_FROM = 0.9;

/** "used / max" counter; polite live region only near the limit, so typing stays quiet. */
export function LimitMeter({
  id,
  used,
  max,
  unit = 'characters',
}: {
  id?: string;
  used: number;
  max: number;
  unit?: 'characters' | 'bytes';
}): ReactElement {
  const near = used > max * ANNOUNCE_FROM;
  const over = used > max;
  const className = ['limit-meter', near && 'limit-meter--near', over && 'limit-meter--over']
    .filter(Boolean)
    .join(' ');
  return (
    <span id={id} className={className} aria-live={near ? 'polite' : undefined}>
      {used} / {max} {unit}
    </span>
  );
}
