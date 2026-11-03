import { check, index, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { analyticsConsentEnum, analyticsConsentSourceEnum, tstz } from './common';
import { users } from './users';

/**
 * D259: append-only audit row per change to a member's analytics choice, written in the same
 * transaction as the `users` update. The member is also the actor (only they can change it).
 * No email, IP or user agent.
 */
export const analyticsConsentEvents = pgTable(
  'analytics_consent_events',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** null = not answered. */
    fromValue: analyticsConsentEnum(),
    toValue: analyticsConsentEnum().notNull(),
    source: analyticsConsentSourceEnum().notNull(),
    requestId: text().notNull(),
    createdAt: tstz().notNull().defaultNow(),
  },
  (t) => [
    index('analytics_consent_events_user_idx').on(t.userId, t.createdAt),
    index('analytics_consent_events_created_idx').on(t.createdAt),
    check('analytics_consent_events_changed', sql`${t.fromValue} IS DISTINCT FROM ${t.toValue}`),
  ],
);
