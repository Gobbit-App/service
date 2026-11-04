import type { Deck } from '@gobbit/shared';
import { can } from '@gobbit/shared/authz';
import { useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { meQuery } from '../api/queries';
import { ALL_CATEGORIES } from '../browse/browse-params';
import { BrowseButton } from '../items/BrowseButton';
import { NotificationsBell } from '../notifications/NotificationsBell';
import { ReviewPill } from '../review/ReviewPill';
import { IconButton } from '../ui/buttons/IconButton';
import { deckHref } from '../ui/chip-order';
import { MoreMenu } from '../ui/MoreMenu';
import { useNavigateHref } from '../ui/NavLink';
import { createActions } from './create-actions';
import { menuActions } from './deck-menu-actions';
import { useSignOut } from './use-sign-out';

type BarDeck = Pick<Deck, 'slug' | 'role' | 'isDefault'>;

/**
 * D274 / ADR-067: the fixed bottom bar of signed-in pages: ⋯ menu | Browse, Review, bell | +
 * (the bell is on every bar page, 037 D298).
 * Deck pages pass `deck` (the + is the create menu, held = new card, D275); the deck list passes
 * `onNewDeck` (D279); `/settings` passes neither (no +). The spacer keeps the last content clear.
 */
export function BottomBar({
  deck,
  browseC,
  onNewDeck,
}: {
  deck?: BarDeck;
  /** Category Browse opens on (D277); null/undefined = All. */
  browseC?: string | null;
  onNewDeck?: () => void;
}): ReactElement {
  const me = useQuery(meQuery());
  const signOut = useSignOut();
  const navigate = useNavigateHref();

  const menu = menuActions({
    deck,
    isPlatformAdmin: me.data?.isPlatformAdmin ?? false,
    email: me.data?.user.email,
    onSignOut: signOut.signOut,
    signingOut: signOut.signingOut,
  });
  const create = deck ? createActions(deck) : [];
  const review = deck !== undefined && !deck.isDefault && can(deck.role, 'item.publish');

  return (
    <>
      <div className="bottom-bar__spacer" aria-hidden="true" />
      <nav className="bottom-bar" aria-label={deck ? 'Deck actions' : 'Actions'}>
        <MoreMenu actions={menu} label="Menu" icon="more" className="bottom-bar__menu" />
        <div className="bottom-bar__main">
          {deck && <BrowseButton deckSlug={deck.slug} c={browseC ?? ALL_CATEGORIES} />}
          {review && <ReviewPill deckSlug={deck.slug} />}
          <NotificationsBell />
        </div>
        {deck && create.length > 0 && (
          <MoreMenu
            actions={create}
            label="Add"
            icon="plus"
            className="bottom-bar__add"
            triggerClassName="bottom-bar__plus"
            onLongPress={() => navigate(deckHref(deck.slug, 'new'))}
          />
        )}
        {!deck && onNewDeck && (
          <IconButton
            icon="plus"
            label="New deck"
            className="bottom-bar__plus bottom-bar__add"
            onClick={onNewDeck}
          />
        )}
      </nav>
    </>
  );
}
