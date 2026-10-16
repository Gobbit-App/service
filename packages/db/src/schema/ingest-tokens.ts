import { index, pgTable, text, uuid, varchar } from 'drizzle-orm/pg-core';
import { tstz } from './common';
import { decks } from './decks';
import { users } from './users';

/** D99: ingest-only, non-expiring, revocable tokens for the iOS Shortcut and email-in. */
export const ingestTokens = pgTable(
  'ingest_tokens',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** NULL: the request's deckId, else the user's `me` deck. */
    deckId: uuid().references(() => decks.id, { onDelete: 'cascade' }),
    label: varchar({ length: 60 }).notNull(),
    /** sha256 hex of the plain token (shown once). */
    tokenHash: text().notNull().unique(),
    /** Shown in settings (`ing_x7Q2`). */
    prefix: varchar({ length: 12 }).notNull(),
    lastUsedAt: tstz(),
    revokedAt: tstz(),
    createdAt: tstz().notNull().defaultNow(),
  },
  (t) => [index('ingest_tokens_user_idx').on(t.userId)],
);
