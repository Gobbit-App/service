import { notFound } from '../errors/http-errors';
import { authorize, type MembershipLookup } from '../access/authorize';
import type { CurrentUser } from '../types';
import type { FavoritesRepo } from '../repositories/favorites.repo';
import type { ItemsRepo } from '../repositories/items.repo';
import type { DecksRepo } from '../repositories/decks.repo';

const ITEM_NOT_FOUND = 'Item not found';

export function createFavoritesService(deps: {
  decks: DecksRepo;
  items: ItemsRepo;
  favorites: FavoritesRepo;
  memberships: MembershipLookup;
}) {
  const { decks, items, favorites, memberships } = deps;

  /** Readers may favorite (§ 4); a card hidden by visibility is a 404 (D38). */
  async function loadFavoritable(user: CurrentUser, itemId: string): Promise<string> {
    const item = await items.findById(itemId);
    if (!item) throw notFound(ITEM_NOT_FOUND);

    const deck = await decks.findById(item.deckId);
    if (!deck) throw notFound(ITEM_NOT_FOUND);

    const role = await authorize(user, deck, 'item.favorite', memberships, ITEM_NOT_FOUND);
    if (!(await items.isVisibleTo(item.id, role))) throw notFound(ITEM_NOT_FOUND);
    return item.id;
  }

  return {
    async add(user: CurrentUser, itemId: string): Promise<void> {
      await favorites.add(user.id, await loadFavoritable(user, itemId));
    },

    async remove(user: CurrentUser, itemId: string): Promise<void> {
      await favorites.remove(user.id, await loadFavoritable(user, itemId));
    },
  };
}

export type FavoritesService = ReturnType<typeof createFavoritesService>;
