import { index, pgTable, uuid } from 'drizzle-orm/pg-core';
import { tstz, waitlistEventActionEnum, waitlistSourceEnum } from './common';
import { users } from './users';

/**
 * D240: append-only audit row per change to a waitlist entry, written in the same transaction.
 * No email and no FK to the entry, so the history survives the prune; `actor_id` is the admin
 * for invite/remove actions (032), null for visitor actions.
 */
export const waitlistEvents = pgTable(
  'waitlist_events',
  {
    id: uuid().primaryKey().defaultRandom(),
    entryId: uuid().notNull(),
    action: waitlistEventActionEnum().notNull(),
    actorId: uuid().references(() => users.id, { onDelete: 'set null' }),
    source: waitlistSourceEnum(),
    createdAt: tstz().notNull().defaultNow(),
  },
  (t) => [
    index('waitlist_events_entry_idx').on(t.entryId, t.createdAt),
    index('waitlist_events_created_idx').on(t.createdAt),
  ],
);
