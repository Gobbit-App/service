import { RESERVED_DECK_SLUG } from '@gobbit/shared';
import type { DeckRow } from '@gobbit/db';
import { notFound } from '../errors/http-errors';
import type { CurrentUser } from '../types';

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

/**
 * Resolves a deck from its id, its slug, or `me` (Phase 3B: the caller's personal deck).
 * `me` is never looked up by slug, so no other deck can answer to it.
 */
export async function resolveDeck(
  repo: {
    findById(id: string): Promise<DeckRow | null>;
    findBySlug(slug: string): Promise<DeckRow | null>;
    findDefaultForAccount(accountId: string): Promise<DeckRow | null>;
  },
  idOrSlug: string,
  user: Pick<CurrentUser, 'accountId'>,
): Promise<DeckRow> {
  let deck: DeckRow | null;
  if (idOrSlug === RESERVED_DECK_SLUG) {
    deck = await repo.findDefaultForAccount(user.accountId);
  } else if (isUuid(idOrSlug)) {
    deck = await repo.findById(idOrSlug);
  } else {
    deck = await repo.findBySlug(idOrSlug);
  }
  if (!deck) {
    throw notFound('Deck not found');
  }
  return deck;
}
