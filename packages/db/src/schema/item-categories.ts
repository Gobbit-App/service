import { foreignKey, index, pgTable, primaryKey, uuid } from 'drizzle-orm/pg-core';
import { categories } from './categories';
import { items } from './items';
import { tstz } from './common';

export const itemCategories = pgTable(
  'item_categories',
  {
    itemId: uuid().notNull(),
    categoryId: uuid().notNull(),
    deckId: uuid().notNull(),
    createdAt: tstz().notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.itemId, t.categoryId] }),
    foreignKey({
      name: 'item_categories_item_fk',
      columns: [t.itemId, t.deckId],
      foreignColumns: [items.id, items.deckId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'item_categories_category_fk',
      columns: [t.categoryId, t.deckId],
      foreignColumns: [categories.id, categories.deckId],
    }).onDelete('cascade'),
    index('item_categories_category_idx').on(t.categoryId),
  ],
);
