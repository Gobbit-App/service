import { pgTable, uuid, text, boolean, integer, unique, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { categoryVisibilityEnum, timestamps } from './common';
import { decks } from './decks';

export const categories = pgTable(
  'categories',
  {
    id: uuid().primaryKey().defaultRandom(),
    deckId: uuid()
      .notNull()
      .references(() => decks.id, { onDelete: 'cascade' }),
    slug: text().notNull(),
    name: text().notNull(),
    visibility: categoryVisibilityEnum().notNull().default('shared'),
    isDefault: boolean().notNull().default(false),
    position: integer().notNull().default(0),
    ...timestamps,
  },
  (t) => [
    unique('categories_id_deck_uq').on(t.id, t.deckId),
    uniqueIndex('categories_deck_slug_active_uq')
      .on(t.deckId, t.slug)
      .where(sql`deleted_at is null`),
  ],
);
