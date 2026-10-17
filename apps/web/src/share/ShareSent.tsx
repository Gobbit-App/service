import type { ReactElement } from 'react';
import type { Deck } from '@pb/shared';
import { can } from '@pb/shared/authz';
import { NavLink } from '../ui/NavLink';
import { EmptyState } from '../ui/StatusViews';

/** D108: after "Send to Gobbit"; publishers get a link straight to the review queue. */
export function ShareSent({ deck }: { deck: Deck }): ReactElement {
  const base = `/d/${encodeURIComponent(deck.slug)}`;
  return (
    <EmptyState
      title="Sent — it'll appear in Review"
      action={
        <div className="share-sent__links">
          {can(deck.role, 'item.publish') && (
            <NavLink href={`${base}/review`} className="button">
              Open review
            </NavLink>
          )}
          <NavLink href={base} className="button button--ghost">
            Back to {deck.name}
          </NavLink>
        </div>
      }
    >
      Gobbit is turning it into a card for <span dir="auto">{deck.name}</span>.
    </EmptyState>
  );
}
