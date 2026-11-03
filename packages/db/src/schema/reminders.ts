import { check, index, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { REMINDER_RESOLUTION_MAX } from '@gobbit/shared';
import { reminderOutcomeEnum, tstz } from './common';
import { decks } from './decks';
import { items } from './items';
import { users } from './users';

/**
 * D291: server-owned state of a reminder card, 1:1 with the item. `deck_id` and `deadline` are
 * kept in step with the item's payload by trigger `items_reminder_sync`; the outcome, dismissal and
 * `notified_deadline` are written only by the reminders service and the sweep.
 */
export const reminders = pgTable(
  'reminders',
  {
    itemId: uuid()
      .primaryKey()
      .references(() => items.id, { onDelete: 'cascade' }),
    deckId: uuid()
      .notNull()
      .references(() => decks.id, { onDelete: 'cascade' }),
    deadline: tstz().notNull(),
    outcome: reminderOutcomeEnum().notNull().default('pending'),
    dismissedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    dismissedAt: tstz(),
    resolution: text(),
    /** D295: the deadline whose notifications were planned; a new deadline notifies again. */
    notifiedDeadline: tstz(),
    createdAt: tstz().notNull().defaultNow(),
    updatedAt: tstz().notNull().defaultNow(),
  },
  (t) => [
    index('reminders_due_idx')
      .on(t.deadline)
      .where(sql`${t.outcome} = 'pending'`),
    index('reminders_deck_idx').on(t.deckId),
    check('reminders_dismissed_chk', sql`(${t.outcome} = 'pending') = (${t.dismissedAt} IS NULL)`),
    check(
      'reminders_resolution_chk',
      sql`${t.resolution} IS NULL OR char_length(${t.resolution}) <= ${sql.raw(String(REMINDER_RESOLUTION_MAX))}`,
    ),
  ],
);
