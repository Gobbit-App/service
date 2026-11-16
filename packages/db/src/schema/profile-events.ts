import { index, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { tstz } from './common';
import { users } from './users';

/** Append-only audit of profile edits: field names only, never values; self is always the actor. */
export const profileEvents = pgTable(
  'profile_events',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid().references(() => users.id, { onDelete: 'set null' }),
    changes: text().array().notNull(),
    requestId: text(),
    createdAt: tstz().notNull().defaultNow(),
  },
  (t) => [index('profile_events_user_idx').on(t.userId, t.createdAt)],
);
