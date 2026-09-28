export * from './schema/common';
export * from './schema/health';
export * from './schema/accounts';
export * from './schema/users';
export * from './schema/pocketbooks';
export * from './schema/categories';
export * from './schema/items';
export * from './schema/item-categories';
export * from './schema/favorites';

export * from './client';
export * from './migrations';

// Import tables for row types
import { accounts } from './schema/accounts';
import { users } from './schema/users';
import { pocketbooks } from './schema/pocketbooks';
import { categories } from './schema/categories';
import { items } from './schema/items';
import { itemCategories } from './schema/item-categories';
import { favorites } from './schema/favorites';

// Row types
export type AccountRow = typeof accounts.$inferSelect;
export type UserRow = typeof users.$inferSelect;
export type PocketbookRow = typeof pocketbooks.$inferSelect;
export type CategoryRow = typeof categories.$inferSelect;
export type ItemRow = typeof items.$inferSelect;
export type ItemCategoryRow = typeof itemCategories.$inferSelect;
export type FavoriteRow = typeof favorites.$inferSelect;

export type NewPocketbookRow = typeof pocketbooks.$inferInsert;
export type NewCategoryRow = typeof categories.$inferInsert;
export type NewItemRow = typeof items.$inferInsert;
