import { pgTable, text, integer, primaryKey } from 'drizzle-orm/pg-core';
import { tstz } from './common';

/** D39: fixed-window counters (one row per key per hour). */
export const rateLimitCounters = pgTable(
  'rate_limit_counters',
  {
    key: text().notNull(),
    windowStart: tstz().notNull(),
    count: integer().notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);
