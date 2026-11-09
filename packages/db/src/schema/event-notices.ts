import { check, index, integer, pgEnum, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import {
  eventNoticeSkipReasons,
  eventNoticeStates,
  eventNoticeUnits,
} from '@gobbit/shared/event-constants';
import { tstz } from './common';
import { items } from './items';

export const eventNoticeStateEnum = pgEnum('event_notice_state', eventNoticeStates);

const inList = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(', '));

/**
 * D359: one notify moment per event start. A moment already planned for the same start is never
 * recreated (unique key); only `pending` rows are ever deleted (notify time removed / start moved).
 */
export const eventNotices = pgTable(
  'event_notices',
  {
    id: uuid().primaryKey().defaultRandom(),
    itemId: uuid()
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    startsAt: tstz().notNull(),
    beforeAmount: integer().notNull(),
    beforeUnit: text().notNull(),
    fireAt: tstz().notNull(),
    state: eventNoticeStateEnum().notNull().default('pending'),
    skipReason: text(),
    plannedAt: tstz(),
    createdAt: tstz().notNull().defaultNow(),
    updatedAt: tstz().notNull().defaultNow(),
  },
  (t) => [
    unique('event_notices_once_uq').on(t.itemId, t.startsAt, t.beforeAmount, t.beforeUnit),
    index('event_notices_due_idx')
      .on(t.fireAt)
      .where(sql`${t.state} = 'pending'`),
    check('event_notices_amount_chk', sql`${t.beforeAmount} >= 0`),
    check('event_notices_unit_chk', sql`${t.beforeUnit} IN (${inList(eventNoticeUnits)})`),
    check(
      'event_notices_skip_reason_chk',
      sql`${t.skipReason} IS NULL OR ${t.skipReason} IN (${inList(eventNoticeSkipReasons)})`,
    ),
    check(
      'event_notices_skipped_chk',
      sql`(${t.state} = 'skipped') = (${t.skipReason} IS NOT NULL)`,
    ),
    check(
      'event_notices_planned_chk',
      sql`(${t.state} = 'planned') = (${t.plannedAt} IS NOT NULL)`,
    ),
  ],
);
