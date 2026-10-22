import { check, index, integer, pgEnum, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { linkCheckStatuses } from '@pb/shared';
import { tstz } from './common';
import { items } from './items';

export const linkCheckStatusEnum = pgEnum('link_check_status', linkCheckStatuses);

/**
 * D164: one row per link card, created on its first check. Kept out of `items` so checks never
 * move `updated_at`, `search_text` or embeddings. Every write sets `checked_at` (no trigger).
 */
export const linkChecks = pgTable(
  'link_checks',
  {
    itemId: uuid()
      .primaryKey()
      .references(() => items.id, { onDelete: 'cascade' }),
    status: linkCheckStatusEnum().notNull(),
    httpStatus: integer(),
    error: text(),
    titleSeen: text(),
    consecutiveFailures: integer().notNull().default(0),
    checkedAt: tstz().notNull(),
    nextCheckAt: tstz().notNull(),
    flaggedAt: tstz(),
    dismissedAt: tstz(),
  },
  (t) => [
    index('link_checks_next_check_idx').on(t.nextCheckAt),
    index('link_checks_flagged_idx')
      .on(t.flaggedAt.desc())
      .where(sql`${t.flaggedAt} IS NOT NULL AND ${t.dismissedAt} IS NULL`),
    check('link_checks_failures_chk', sql`${t.consecutiveFailures} >= 0`),
    check('link_checks_dismissed_chk', sql`${t.dismissedAt} IS NULL OR ${t.flaggedAt} IS NOT NULL`),
  ],
);
