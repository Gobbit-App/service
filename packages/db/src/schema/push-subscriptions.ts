import { index, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { tstz } from './common';
import { users } from './users';

/**
 * D297: one row per device a member turned notifications on for. Upserted by endpoint; deleted
 * when the member turns it off, signs out of that device, or the push service answers 404/410.
 */
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    endpoint: text().notNull().unique(),
    p256dh: text().notNull(),
    auth: text().notNull(),
    /** Short device label for Settings ("Chrome on Android"); never the raw user agent. */
    label: text(),
    createdAt: tstz().notNull().defaultNow(),
    lastUsedAt: tstz(),
  },
  (t) => [index('push_subscriptions_user_idx').on(t.userId)],
);
