import { lt, sql } from 'drizzle-orm';
import { rateLimitCounters, type Db } from '@pb/db';

export function createRateLimitsRepo(db: Db) {
  return {
    /** D39: increments the counter for `(key, windowStart)` and returns the new count. */
    async hit(key: string, windowStart: Date): Promise<number> {
      const [row] = await db
        .insert(rateLimitCounters)
        .values({ key, windowStart, count: 1 })
        .onConflictDoUpdate({
          target: [rateLimitCounters.key, rateLimitCounters.windowStart],
          set: { count: sql`${rateLimitCounters.count} + 1` },
        })
        .returning({ count: rateLimitCounters.count });
      return row.count;
    },

    async purgeBefore(ts: Date): Promise<number> {
      const rows = await db
        .delete(rateLimitCounters)
        .where(lt(rateLimitCounters.windowStart, ts))
        .returning({ key: rateLimitCounters.key });
      return rows.length;
    },
  };
}

export type RateLimitsRepo = ReturnType<typeof createRateLimitsRepo>;
