import type { DeckRow } from '@pb/db';
import { notFound } from '../errors/http-errors';

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

export async function resolveDeck(
  repo: {
    findById(id: string): Promise<DeckRow | null>;
    findBySlug(slug: string): Promise<DeckRow | null>;
  },
  idOrSlug: string,
): Promise<DeckRow> {
  const deck = isUuid(idOrSlug) ? await repo.findById(idOrSlug) : await repo.findBySlug(idOrSlug);
  if (!deck) {
    throw notFound('Deck not found');
  }
  return deck;
}
