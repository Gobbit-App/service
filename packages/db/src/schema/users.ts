import { check, pgTable, text, uuid, uniqueIndex, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { accounts } from './accounts';
import {
  analyticsConsentEnum,
  analyticsConsentSourceEnum,
  registrationReasonEnum,
  timestamps,
  tstz,
} from './common';

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
    /** D259: the member's analytics choice; null = not answered (off, opt-in D281). */
    analyticsConsent: analyticsConsentEnum(),
    /** D259: when the current choice was made. */
    analyticsConsentAt: tstz(),
    /** D259: where the current choice was made. */
    analyticsConsentSource: analyticsConsentSourceEnum(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('users_email_active_uq')
      .on(t.email)
      .where(sql`deleted_at is null`),
    check(
      'users_analytics_consent_complete',
      sql`(${t.analyticsConsent} IS NULL AND ${t.analyticsConsentAt} IS NULL AND ${t.analyticsConsentSource} IS NULL) OR (${t.analyticsConsent} IS NOT NULL AND ${t.analyticsConsentAt} IS NOT NULL AND ${t.analyticsConsentSource} IS NOT NULL)`,
    ),
  ],
);
