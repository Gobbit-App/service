export * from './common';
export * from './health';
export * from './accounts';
export * from './users';
export * from './decks';
export * from './categories';
export * from './items';
export * from './item-categories';
export * from './favorites';

import { accounts } from './accounts';
import { users } from './users';
import { decks } from './decks';
import { categories } from './categories';
import { items } from './items';
import { itemCategories } from './item-categories';
import { favorites } from './favorites';

export type AccountRow = typeof accounts.$inferSelect;
export type UserRow = typeof users.$inferSelect;
export type DeckRow = typeof decks.$inferSelect;
export type CategoryRow = typeof categories.$inferSelect;
export type ItemRow = typeof items.$inferSelect;
export type ItemCategoryRow = typeof itemCategories.$inferSelect;
export type FavoriteRow = typeof favorites.$inferSelect;

export type NewDeckRow = typeof decks.$inferInsert;
export type NewCategoryRow = typeof categories.$inferInsert;
export type NewItemRow = typeof items.$inferInsert;
