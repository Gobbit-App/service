import { useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import type { Deck } from '@gobbit/shared';
import { can } from '@gobbit/shared/authz';
import { useOnline } from '../api/offline';
import { heldReason, stateLabel } from '../shares/share-state';
import { ShareDetail } from '../shares/ShareRow';
import { shareQuery } from '../shares/shares-queries';
import { deckHref } from '../ui/chip-order';
import { EmptyState } from '../ui/StatusViews';
import { ButtonLink } from '../ui/buttons/ButtonLink';

/**
 * D108/D198: after "Send to Gobbit". Shows the share's live status (polled until it leaves
 * processing) and links to Your shares; it no longer promises the share lands in Review (FR-006).
 */
export function ShareSent({ deck, shareId }: { deck: Deck; shareId: string }): ReactElement {
  const share = useQuery(shareQuery(shareId));
  const online = useOnline();
  const status = share.data;
  const held = status ? heldReason(status) : null;

  return (
    <EmptyState
      title="Sent"
      action={
        <div className="share-sent__links">
          <ButtonLink href={deckHref(deck.slug, 'shares')} icon="send" label="Your shares" />
          <ButtonLink
            href={deckHref(deck.slug)}
            icon="back"
            label={`Back to ${deck.name}`}
            variant="ghost"
          />
        </div>
      }
    >
      <p className="share-row__state" aria-live="polite">
        {status ? stateLabel(status.state) : 'Processing…'}
        {held && ` — ${held}`}
      </p>
      {(!status || status.state === 'processing') && (
        <p>
          Gobbit is turning it into a card for <span dir="auto">{deck.name}</span>.
        </p>
      )}
      {status && (
        <ShareDetail
          share={status}
          deckSlug={deck.slug}
          online={online}
          now={new Date()}
          canRestore={can(deck.role, 'item.delete')}
        />
      )}
    </EmptyState>
  );
}
