import type { ReactElement } from 'react';
import { classNames } from '../../ui/buttons/button-props';
import { shouldShowCount } from './limit-meter';

/** Above this share of the limit the meter is announced (contracts/editor-ui.md). */
const ANNOUNCE_FROM = 0.9;

/**
 * "used / max" counter. D307 (039): shown from 80 % of the limit and always when over it, so a
 * calm canvas carries no permanent numbers; a polite live region only near the limit.
 * The element stays mounted (empty) so an `aria-describedby` pointing at it never dangles.
 */
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
  const className = classNames(
    'limit-meter',
    near && 'limit-meter--near',
    over && 'limit-meter--over',
  );
  return (
    <span id={id} className={className} aria-live={near ? 'polite' : undefined}>
      {shouldShowCount(used, max) ? `${used} / ${max} ${unit}` : null}
    </span>
  );
}
