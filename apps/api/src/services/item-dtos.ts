import type { ItemRow } from '@gobbit/db';
import type { Item, MemberRole, ReminderState } from '@gobbit/shared';
import type { FavoritesRepo } from '../repositories/favorites.repo';
import type { ItemsRepo } from '../repositories/items.repo';
import type { LinkChecksRepo } from '../repositories/link-checks.repo';
import { toItemDto } from '../lib/mappers';
import type { CurrentUser } from '../types';

export type ItemDtoMapper = (
  user: CurrentUser,
  rows: ItemRow[],
  role: MemberRole,
) => Promise<Item[]>;

/** D291: each reminder row's state as the caller sees it. */
export type ReminderStates = (
  user: CurrentUser,
  rows: ItemRow[],
  role: MemberRole,
) => Promise<Map<string, ReminderState>>;

/**
 * Rows → DTOs with the categories `role` can see, the user's favorite flag and the link's active
 * check flag (D165); shared by items, review and search.
 */
export function createItemDtoMapper(deps: {
  items: Pick<ItemsRepo, 'categoryIdsFor'>;
  favorites: Pick<FavoritesRepo, 'favoritedAmong'>;
  linkChecks: Pick<LinkChecksRepo, 'flagsFor'>;
  /** D291: the `reminder` field of reminder cards (omitted in tests that don't need it). */
  reminderStates?: ReminderStates;
}): ItemDtoMapper {
  const { items, favorites, linkChecks, reminderStates } = deps;

  return async (user, rows, role) => {
    if (rows.length === 0) return [];

    const itemIds = rows.map((r) => r.id);
    const categoryIdsMap = await items.categoryIdsFor(itemIds, role);
    const favoriteIds = await favorites.favoritedAmong(user.id, itemIds);
    const linkIds = rows.filter((r) => r.type === 'link').map((r) => r.id);
    const flags = await linkChecks.flagsFor(linkIds);
    const reminderRows = rows.filter((r) => r.type === 'reminder');
    const reminders =
      reminderStates && reminderRows.length > 0
        ? await reminderStates(user, reminderRows, role)
        : new Map<string, ReminderState>();

    return rows.map((row) => {
      const flag = flags.get(row.id);
      return toItemDto(
        row,
        categoryIdsMap.get(row.id) ?? [],
        favoriteIds.has(row.id),
        flag ? { status: flag.status, checkedAt: flag.checkedAt.toISOString() } : null,
        reminders.get(row.id) ?? null,
      );
    });
  };
}
