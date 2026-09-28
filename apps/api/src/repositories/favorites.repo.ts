import { and, eq, inArray } from 'drizzle-orm';
import { type Db, favorites } from '@pb/db';

export function createFavoritesRepo(db: Db) {
  return {
    async add(userId: string, itemId: string): Promise<void> {
      await db.insert(favorites).values({ userId, itemId }).onConflictDoNothing();
    },

    async remove(userId: string, itemId: string): Promise<void> {
      await db
        .delete(favorites)
        .where(and(eq(favorites.userId, userId), eq(favorites.itemId, itemId)));
    },

    async favoritedAmong(userId: string, itemIds: string[]): Promise<Set<string>> {
      if (itemIds.length === 0) {
        return new Set();
      }

      const rows = await db
        .select({ itemId: favorites.itemId })
        .from(favorites)
        .where(and(eq(favorites.userId, userId), inArray(favorites.itemId, itemIds)));

      return new Set(rows.map((row) => row.itemId));
    },
  };
}

export type FavoritesRepo = ReturnType<typeof createFavoritesRepo>;
