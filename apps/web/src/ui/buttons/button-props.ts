import type { MouseEvent } from 'react';

/** D211: tooltip text: the tip (or label), plus why the control can't run right now. */
export function tipText(label: string, tip?: string, disabledReason?: string | null): string {
  const base = tip ?? label;
  return disabledReason ? `${base} — ${disabledReason}` : base;
}

/**
 * An `aria-disabled` control stays focusable (its tooltip explains why) but does nothing, except
 * tell `onBlocked` (e.g. a blocked Save reveals what to fix, D308).
 */
export function guardClick<E extends MouseEvent>(
  disabledReason: string | null | undefined,
  onClick: ((event: E) => void) | undefined,
  onBlocked?: () => void,
): (event: E) => void {
  return (event) => {
    if (disabledReason) {
      event.preventDefault();
      onBlocked?.();
      return;
    }
    onClick?.(event);
  };
}

export function classNames(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(' ');
}
