import type { Category, Deck } from '@gobbit/shared';
import { DECK_LIST_HREF } from '../app/back-target';
import { chipHref, deckHref, sameView, type ChipView } from '../ui/chip-order';
import { deckViews, viewLabel, type DeckViewOptions } from '../ui/deck-views';
import type { MenuAction } from '../ui/MoreMenu';

/**
 * D381: the deck switcher. Every deck the user is in (API order), the current one checked, each
 * opening on its main page; then the deck list itself.
 */
export function deckSwitchActions(
  decks: readonly Pick<Deck, 'id' | 'slug' | 'name'>[],
  currentSlug: string,
): MenuAction[] {
  return [
    ...decks.map((deck) => ({
      key: `deck-${deck.id}`,
      label: deck.name,
      href: deckHref(deck.slug),
      checked: deck.slug === currentSlug,
    })),
    { key: 'all-decks', label: 'All decks', icon: 'list', href: DECK_LIST_HREF },
  ];
}

/**
 * D381: the category switcher lists the same views the chip row did, the current one checked.
 * `active` is null off the list views (search results): nothing is checked.
 */
export function categorySwitchActions(
  deckSlug: string,
  categories: readonly Category[],
  active: ChipView | null,
  options: DeckViewOptions,
): MenuAction[] {
  return deckViews(categories, options).map((view) => ({
    key: view.kind === 'category' ? `category-${view.slug}` : view.kind,
    label: viewLabel(view, categories),
    href: chipHref(deckSlug, view),
    checked: active !== null && sameView(view, active),
  }));
}
