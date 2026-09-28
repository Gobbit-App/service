import { notFound } from '../errors/http-errors';
import { assertPocketbookAccess } from '../access/assert-pocketbook-access';
import type { CurrentUser } from '../types';
import type { FavoritesRepo } from '../repositories/favorites.repo';
import type { ItemsRepo } from '../repositories/items.repo';
import type { PocketbooksRepo } from '../repositories/pocketbooks.repo';

export function createFavoritesService(deps: {
  pocketbooks: PocketbooksRepo;
  items: ItemsRepo;
  favorites: FavoritesRepo;
}) {
  const { pocketbooks, items, favorites } = deps;

  return {
    async add(user: CurrentUser, itemId: string): Promise<void> {
      const item = await items.findById(itemId);
      if (!item) {
        throw notFound('Item not found');
      }

      const pocketbook = await pocketbooks.findById(item.pocketbookId);
      if (!pocketbook) {
        throw notFound('Item not found');
      }

      assertPocketbookAccess(user, pocketbook, 'write');

      await favorites.add(user.id, itemId);
    },

    async remove(user: CurrentUser, itemId: string): Promise<void> {
      const item = await items.findById(itemId);
      if (!item) {
        throw notFound('Item not found');
      }

      const pocketbook = await pocketbooks.findById(item.pocketbookId);
      if (!pocketbook) {
        throw notFound('Item not found');
      }

      assertPocketbookAccess(user, pocketbook, 'write');

      await favorites.remove(user.id, itemId);
    },
  };
}

export type FavoritesService = ReturnType<typeof createFavoritesService>;
