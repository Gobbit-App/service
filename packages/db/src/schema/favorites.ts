import { pgTable, uuid, primaryKey } from 'drizzle-orm/pg-core';
import { users } from './users';
import { items } from './items';
import { tstz } from './common';

export const favorites = pgTable(
  'favorites',
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    itemId: uuid()
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    createdAt: tstz().notNull().defaultNow(),
  },
  (t) => [
    primaryKey({
      columns: [t.userId, t.itemId],
    }),
  ],
);
