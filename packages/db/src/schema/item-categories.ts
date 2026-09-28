import { foreignKey, index, pgTable, primaryKey, uuid } from 'drizzle-orm/pg-core';
import { categories } from './categories';
import { items } from './items';
import { tstz } from './common';

export const itemCategories = pgTable(
  'item_categories',
  {
    itemId: uuid().notNull(),
    categoryId: uuid().notNull(),
    pocketbookId: uuid().notNull(),
    createdAt: tstz().notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.itemId, t.categoryId] }),
    foreignKey({
      name: 'item_categories_item_fk',
      columns: [t.itemId, t.pocketbookId],
      foreignColumns: [items.id, items.pocketbookId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'item_categories_category_fk',
      columns: [t.categoryId, t.pocketbookId],
      foreignColumns: [categories.id, categories.pocketbookId],
    }).onDelete('cascade'),
    index('item_categories_category_idx').on(t.categoryId),
  ],
);
