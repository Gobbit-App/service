export * from './common';
export * from './health';
export * from './accounts';
export * from './users';
export * from './pocketbooks';
export * from './categories';
export * from './items';
export * from './item-categories';
export * from './favorites';

import { accounts } from './accounts';
import { users } from './users';
import { pocketbooks } from './pocketbooks';
import { categories } from './categories';
import { items } from './items';
import { itemCategories } from './item-categories';
import { favorites } from './favorites';

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
