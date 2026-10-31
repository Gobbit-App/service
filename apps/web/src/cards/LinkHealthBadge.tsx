import type { ReactElement } from 'react';
import type { LinkHealth } from '@gobbit/shared';

export const LINK_HEALTH_COPY: Record<LinkHealth['status'], string> = {
  dead: 'Link may be dead',
  changed: 'Link may have changed',
};

/** Formats the check time for the badge's tooltip; invalid dates fall back to the raw value. */
export function checkedTitle(checkedAt: string): string {
  const date = new Date(checkedAt);
  if (Number.isNaN(date.getTime())) return `Checked ${checkedAt}`;
  return `Checked ${date.toLocaleDateString(undefined, { dateStyle: 'medium' })}`;
}

/** D165: a quiet note on a flagged link card, shown to every reader. */
export function LinkHealthBadge({ health }: { health: LinkHealth }): ReactElement {
  return (
    <p className="link-health" data-status={health.status} title={checkedTitle(health.checkedAt)}>
      {LINK_HEALTH_COPY[health.status]}
    </p>
  );
}
