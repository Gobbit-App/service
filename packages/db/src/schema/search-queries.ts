import { check, index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tstz } from './common';
import { decks } from './decks';
import { users } from './users';

/** D80: query log for Phase 10 gap detection; pruned after 180 days by a weekly job. */
export const searchQueries = pgTable(
  'search_queries',
  {
    id: uuid().primaryKey().defaultRandom(),
    deckId: uuid()
      .notNull()
      .references(() => decks.id, { onDelete: 'cascade' }),
    userId: uuid().references(() => users.id, { onDelete: 'set null' }),
    mode: text().notNull(),
    qNormalized: text().notNull(),
    resultCount: integer().notNull(),
    topWhy: text(),
    latencyMs: integer().notNull(),
    createdAt: tstz().notNull().defaultNow(),
  },
  (t) => [
    index('search_queries_deck_created_idx').on(t.deckId, t.createdAt.desc()),
    check('search_queries_mode_chk', sql`${t.mode} IN ('search', 'ask')`),
    check('search_queries_top_why_chk', sql`${t.topWhy} IN ('text', 'semantic', 'both')`),
  ],
);
