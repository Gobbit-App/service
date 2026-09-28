import { pgTable, uuid, text, boolean, integer, unique, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { categoryVisibilityEnum, timestamps } from './common';
import { pocketbooks } from './pocketbooks';

export const categories = pgTable(
  'categories',
  {
    id: uuid().primaryKey().defaultRandom(),
    pocketbookId: uuid()
      .notNull()
      .references(() => pocketbooks.id, { onDelete: 'cascade' }),
    slug: text().notNull(),
    name: text().notNull(),
    visibility: categoryVisibilityEnum().notNull().default('shared'),
    isDefault: boolean().notNull().default(false),
    position: integer().notNull().default(0),
    ...timestamps,
  },
  (t) => [
    unique('categories_id_pocketbook_uq').on(t.id, t.pocketbookId),
    uniqueIndex('categories_pocketbook_slug_active_uq')
      .on(t.pocketbookId, t.slug)
      .where(sql`deleted_at is null`),
  ],
);
