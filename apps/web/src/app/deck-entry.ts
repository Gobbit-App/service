import type { Deck } from '@gobbit/shared';
import { can } from '@gobbit/shared/authz';
import { ALL_CATEGORIES } from '../browse/browse-params';
import { deckHref } from '../ui/chip-order';

/**
 * D268: members who don't run the deck (no `deck.update`: editors and readers) open it in
 * Browse; owners and maintainers open the list. Only entry points use this (the landing
 * redirect and the deck list); the header's back control and Browse's close still go to the
 * list, so the two never bounce.
 */
export function opensInBrowse(role: Deck['role']): boolean {
  return !can(role, 'deck.update');
}

/** Where opening a deck lands: its Browse of All cards, or its list. */
export function deckEntryHref(deck: Pick<Deck, 'slug' | 'role'>): string {
  return opensInBrowse(deck.role)
    ? `${deckHref(deck.slug, 'browse')}?c=${ALL_CATEGORIES}`
    : deckHref(deck.slug);
}
