import { boolean, pgTable, primaryKey, uuid } from 'drizzle-orm/pg-core';
import { tstz } from './common';
import { items } from './items';
import { users } from './users';

/**
 * D364: a member's mute of one event's notifications. Unmute keeps the row (`muted = false`) as the
 * last-change record.
 */
export const eventMutes = pgTable(
  'event_mutes',
  {
    itemId: uuid()
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    muted: boolean().notNull(),
    createdAt: tstz().notNull().defaultNow(),
    updatedAt: tstz().notNull().defaultNow(),
  },
  (t) => [primaryKey({ name: 'event_mutes_pk', columns: [t.itemId, t.userId] })],
);
