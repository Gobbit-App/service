import { pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { tstz } from './common';
import { users } from './users';

/** A released username stays reserved for its former owner until `holdUntil`. */
export const usernameHolds = pgTable('username_holds', {
  usernameLower: text().primaryKey(),
  releasedBy: uuid()
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  holdUntil: tstz().notNull(),
  createdAt: tstz().notNull().defaultNow(),
});
