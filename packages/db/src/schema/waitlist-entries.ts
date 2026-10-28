import { check, index, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tstz, waitlistKindEnum, waitlistSourceEnum, waitlistStatusEnum } from './common';
import { users } from './users';

/**
 * D217: one live entry per email (`removed` entries may repeat). Status transitions live in
 * `waitlist.service`; the CHECKs tie each status to its timestamps. Only the sha256 of the
 * confirmation token is stored. Removal is a status, then a hard delete by the prune (D220).
 */
export const waitlistEntries = pgTable(
  'waitlist_entries',
  {
    id: uuid().primaryKey().defaultRandom(),
    email: text().notNull(),
    kind: waitlistKindEnum().notNull(),
    note: text(),
    source: waitlistSourceEnum().notNull(),
    utmSource: text(),
    status: waitlistStatusEnum().notNull().default('pending'),
    confirmTokenHash: text(),
    confirmExpiresAt: tstz(),
    confirmedAt: tstz(),
    invitedAt: tstz(),
    invitedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    userId: uuid().references(() => users.id, { onDelete: 'set null' }),
    removedAt: tstz(),
    removedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    createdAt: tstz().notNull().defaultNow(),
    updatedAt: tstz().notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('waitlist_entries_email_live_uq')
      .on(t.email)
      .where(sql`${t.status} <> 'removed'`),
    uniqueIndex('waitlist_entries_confirm_token_uq')
      .on(t.confirmTokenHash)
      .where(sql`${t.confirmTokenHash} IS NOT NULL`),
    index('waitlist_entries_status_created_idx').on(t.status, t.createdAt),
    index('waitlist_entries_status_confirmed_idx').on(t.status, t.confirmedAt, t.id),
    check(
      'waitlist_email_normalized',
      sql`${t.email} = lower(btrim(${t.email})) AND ${t.email} <> ''`,
    ),
    check('waitlist_note_len', sql`${t.note} IS NULL OR char_length(${t.note}) <= 500`),
    check(
      'waitlist_utm_source_fmt',
      sql`${t.utmSource} IS NULL OR ${t.utmSource} ~ '^[a-z0-9_-]{1,64}$'`,
    ),
    check(
      'waitlist_pending_has_token',
      sql`${t.status} <> 'pending' OR (${t.confirmTokenHash} IS NOT NULL AND ${t.confirmExpiresAt} IS NOT NULL)`,
    ),
    check(
      'waitlist_confirmed_has_time',
      sql`${t.status} NOT IN ('confirmed', 'invited') OR ${t.confirmedAt} IS NOT NULL`,
    ),
    check('waitlist_invited_has_time', sql`${t.status} <> 'invited' OR ${t.invitedAt} IS NOT NULL`),
    check('waitlist_removed_has_time', sql`${t.status} <> 'removed' OR ${t.removedAt} IS NOT NULL`),
  ],
);
