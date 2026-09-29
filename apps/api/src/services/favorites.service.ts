import { notFound } from '../errors/http-errors';
import { assertDeckAccess } from '../access/assert-deck-access';
import type { CurrentUser } from '../types';
import type { FavoritesRepo } from '../repositories/favorites.repo';
import type { ItemsRepo } from '../repositories/items.repo';
import type { DecksRepo } from '../repositories/decks.repo';

export function createFavoritesService(deps: {
  decks: DecksRepo;
  items: ItemsRepo;
  favorites: FavoritesRepo;
}) {
  const { decks, items, favorites } = deps;

  return {
    async add(user: CurrentUser, itemId: string): Promise<void> {
      const item = await items.findById(itemId);
      if (!item) {
        throw notFound('Item not found');
      }

      const deck = await decks.findById(item.deckId);
      if (!deck) {
        throw notFound('Item not found');
      }

      assertDeckAccess(user, deck, 'write');

      await favorites.add(user.id, itemId);
    },

    async remove(user: CurrentUser, itemId: string): Promise<void> {
      const item = await items.findById(itemId);
      if (!item) {
        throw notFound('Item not found');
      }

      const deck = await decks.findById(item.deckId);
      if (!deck) {
        throw notFound('Item not found');
      }

      assertDeckAccess(user, deck, 'write');

      await favorites.remove(user.id, itemId);
    },
  };
}

export type FavoritesService = ReturnType<typeof createFavoritesService>;
