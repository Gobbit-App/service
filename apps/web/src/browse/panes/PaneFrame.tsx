import type { ReactElement, ReactNode } from 'react';
import type { Item } from '@gobbit/shared';

/**
 * The Details and Source panes' frame. The title keeps the card's `card-title-<id>` id, so
 * focus-on-change and `aria-labelledby` work the same in every pane.
 */
export function PaneFrame({ item, children }: { item: Item; children: ReactNode }): ReactElement {
  const titleId = `card-title-${item.id}`;
  return (
    <article className="card browse-pane" aria-labelledby={titleId}>
      <h2 className="card__title" id={titleId} dir="auto">
        {item.title}
      </h2>
      {children}
    </article>
  );
}
