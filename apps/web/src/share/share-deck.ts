import type { Deck } from '@gobbit/shared';
import { can } from '@gobbit/shared/authz';
import { RESERVED_DECK_SLUG } from '@gobbit/shared/decks';

/** Decks the user may share into (D108): roles with `item.create`. */
export function shareableDecks(decks: readonly Deck[]): Deck[] {
  return decks.filter((d) => can(d.role, 'item.create'));
}

/**
 * The picker's starting deck: the one asked for (`?deck=` from the paste entry), else the last
 * opened, else the personal deck, else the first; null when there is nothing to share into.
 */
export function defaultShareDeck(
  decks: readonly Deck[],
  requested: string | undefined,
  last: string | null,
): string | null {
  const slugs = new Set(decks.map((d) => d.slug));
  for (const slug of [requested, last, RESERVED_DECK_SLUG]) {
    if (slug && slugs.has(slug)) return slug;
  }
  return decks[0]?.slug ?? null;
}
