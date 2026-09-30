import { pgTable, uuid, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { memberRoleEnum, timestamps, tstz } from './common';
import { decks } from './decks';
import { users } from './users';

/** D36: one live membership per user–deck pair; removal is a soft delete. */
export const memberships = pgTable(
  'memberships',
  {
    id: uuid().primaryKey().defaultRandom(),
    deckId: uuid()
      .notNull()
      .references(() => decks.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: memberRoleEnum().notNull(),
    invitedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    invitedAt: tstz().notNull().defaultNow(),
    acceptedAt: tstz(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('memberships_deck_user_active_uq')
      .on(t.deckId, t.userId)
      .where(sql`deleted_at is null`),
    index('memberships_user_id_idx').on(t.userId),
  ],
);
