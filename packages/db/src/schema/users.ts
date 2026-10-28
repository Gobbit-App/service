import { pgTable, text, uuid, uniqueIndex, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { accounts } from './accounts';
import { registrationReasonEnum, timestamps } from './common';

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
    /** D241: why the row exists; null for users created before Phase 9. */
    registeredVia: registrationReasonEnum(),
    /** D241: the inviter (`deck_invite`) or admin (`waitlist_invite`); null for `open_sign_in`. */
    registeredBy: uuid().references((): AnyPgColumn => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('users_email_active_uq')
      .on(t.email)
      .where(sql`deleted_at is null`),
  ],
);
