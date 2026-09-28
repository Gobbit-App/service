import { pgTable, text, uuid, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { accounts } from './accounts';
import { timestamps } from './common';

export const users = pgTable(
  'users',
  {
    id: uuid().primaryKey().defaultRandom(),
    accountId: uuid()
      .notNull()
      .unique()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    email: text().notNull(),
    displayName: text().notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('users_email_active_uq')
      .on(t.email)
      .where(sql`deleted_at is null`),
  ],
);
