import { check, index, integer, numeric, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tstz } from './common';
import { decks } from './decks';
import { items } from './items';
import { users } from './users';

/** D78: one row per provider call (embeddings, Ask, extraction), written by recordLlmCall(). */
export const llmCalls = pgTable(
  'llm_calls',
  {
    id: uuid().primaryKey().defaultRandom(),
    purpose: text().notNull(),
    provider: text().notNull(),
    model: text().notNull(),
    deckId: uuid().references(() => decks.id, { onDelete: 'set null' }),
    itemId: uuid().references(() => items.id, { onDelete: 'set null' }),
    userId: uuid().references(() => users.id, { onDelete: 'set null' }),
    jobId: text(),
    inputTokens: integer().notNull().default(0),
    outputTokens: integer().notNull().default(0),
    costUsd: numeric({ precision: 10, scale: 6 }).notNull().default('0'),
    latencyMs: integer().notNull(),
    status: text().notNull(),
    error: text(),
    createdAt: tstz().notNull().defaultNow(),
  },
  (t) => [
    index('llm_calls_created_idx').on(t.createdAt.desc()),
    index('llm_calls_item_idx').on(t.itemId),
    check(
      'llm_calls_purpose_chk',
      sql`${t.purpose} IN ('embed_item', 'embed_query', 'ask', 'extract', 'extract_escalated', 'embed_draft')`,
    ),
    check('llm_calls_status_chk', sql`${t.status} IN ('ok', 'error')`),
  ],
);
