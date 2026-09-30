import { pgTable, uuid, text, boolean, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { deckKindEnum, timestamps } from './common';
import { accounts } from './accounts';

export const decks = pgTable(
  'decks',
  {
    id: uuid().primaryKey().defaultRandom(),
    kind: deckKindEnum().notNull(),
    slug: text().notNull(),
    name: text().notNull(),
    ownerAccountId: uuid()
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    isPublic: boolean().notNull().default(false),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('decks_slug_active_uq')
      .on(t.slug)
      .where(sql`deleted_at is null`),
  ],
);
