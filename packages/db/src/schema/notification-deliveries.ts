import { check, index, integer, pgEnum, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { notificationChannels, notificationStatuses } from '@gobbit/shared';
import { tstz } from './common';
import { items } from './items';
import { users } from './users';

export const notificationChannelEnum = pgEnum('notification_channel', notificationChannels);
export const notificationStatusEnum = pgEnum('notification_status', notificationStatuses);

/**
 * D295: one planned message per (reminder, deadline, person, channel, target) — the unique key
 * makes planning idempotent and every send at most once. Doubles as the audit of what was sent.
 * `target` is `email` or the push subscription id (kept as text: the row outlives the device).
 */
export const notificationDeliveries = pgTable(
  'notification_deliveries',
  {
    id: uuid().primaryKey().defaultRandom(),
    itemId: uuid()
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    deadline: tstz().notNull(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    channel: notificationChannelEnum().notNull(),
    target: text().notNull(),
    status: notificationStatusEnum().notNull().default('pending'),
    attempts: integer().notNull().default(0),
    nextAttemptAt: tstz().notNull().defaultNow(),
    /** A short code (`http_503`, `timeout`), never a response body. */
    lastError: text(),
    createdAt: tstz().notNull().defaultNow(),
    updatedAt: tstz().notNull().defaultNow(),
  },
  (t) => [
    unique('notification_deliveries_once_uq').on(
      t.itemId,
      t.deadline,
      t.userId,
      t.channel,
      t.target,
    ),
    index('notification_deliveries_due_idx').on(t.status, t.nextAttemptAt),
    check('notification_deliveries_attempts_chk', sql`${t.attempts} >= 0`),
  ],
);
