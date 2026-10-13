import { lt } from 'drizzle-orm';
import { searchQueries, type Db, type NewSearchQueryRow } from '@pb/db';

export function createSearchQueriesRepo(db: Db) {
  return {
    async insert(row: NewSearchQueryRow): Promise<void> {
      await db.insert(searchQueries).values(row);
    },

    /** D80: retention prune; returns the number of rows removed. */
    async pruneBefore(ts: Date): Promise<number> {
      const rows = await db
        .delete(searchQueries)
        .where(lt(searchQueries.createdAt, ts))
        .returning({ id: searchQueries.id });
      return rows.length;
    },
  };
}

export type SearchQueriesRepo = ReturnType<typeof createSearchQueriesRepo>;
