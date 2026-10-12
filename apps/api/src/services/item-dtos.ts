import type { ItemRow } from '@pb/db';
import type { Item, MemberRole } from '@pb/shared';
import type { FavoritesRepo } from '../repositories/favorites.repo';
import type { ItemsRepo } from '../repositories/items.repo';
import { toItemDto } from '../lib/mappers';
import type { CurrentUser } from '../types';

export type ItemDtoMapper = (
  user: CurrentUser,
  rows: ItemRow[],
  role: MemberRole,
) => Promise<Item[]>;

/** Rows → DTOs with the categories `role` can see and the user's favorite flag (shared by items and search). */
export function createItemDtoMapper(deps: {
  items: Pick<ItemsRepo, 'categoryIdsFor'>;
  favorites: Pick<FavoritesRepo, 'favoritedAmong'>;
}): ItemDtoMapper {
  const { items, favorites } = deps;

  return async (user, rows, role) => {
    if (rows.length === 0) return [];

    const itemIds = rows.map((r) => r.id);
    const categoryIdsMap = await items.categoryIdsFor(itemIds, role);
    const favoriteIds = await favorites.favoritedAmong(user.id, itemIds);

    return rows.map((row) =>
      toItemDto(row, categoryIdsMap.get(row.id) ?? [], favoriteIds.has(row.id)),
    );
  };
}
