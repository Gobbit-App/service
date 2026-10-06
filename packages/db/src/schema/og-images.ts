import { pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { items } from './items';
import { tstz } from './common';

/** D60: one generated Open Graph image per item; a changed content hash replaces the row. */
export const ogImages = pgTable('og_images', {
  itemId: uuid()
    .primaryKey()
    .references(() => items.id, { onDelete: 'cascade' }),
  contentHash: text().notNull(),
  publicId: text().notNull(),
  createdAt: tstz().notNull().defaultNow(),
});
