import {
  boolean,
  check,
  index,
  jsonb,
  pgTable,
  text,
  uuid,
  uniqueIndex,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { MEMBER_NAME } from '@gobbit/shared';
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
    /** FR-012 (D297): email when a reminder the user may dismiss is due. */
    reminderEmails: boolean().notNull().default(true),
    /** D452: set only by an operator in SQL; platform admins count as on in code. */
    smartShare: boolean().notNull().default(false),
    /** D417: public handle, unique case-insensitively; null until chosen. */
    username: text(),
    firstName: text(),
    lastName: text(),
    location: text(),
    /** D418: Cloudinary reference, rendered through CloudImage. */
    avatar: jsonb().$type<{ publicId: string; width?: number; height?: number }>(),
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
    check('users_username_format_chk', sql`${t.username} ~ '^[A-Za-z0-9][A-Za-z0-9._-]{2,29}$'`),
    uniqueIndex('users_username_lower_uq').on(sql`lower(${t.username})`),
    check(
      'users_first_name_chk',
      sql`char_length(${t.firstName}) <= 60 AND ${t.firstName} = btrim(${t.firstName})`,
    ),
    check(
      'users_last_name_chk',
      sql`char_length(${t.lastName}) <= 60 AND ${t.lastName} = btrim(${t.lastName})`,
    ),
    check(
      'users_location_chk',
      sql`char_length(${t.location}) <= 100 AND ${t.location} = btrim(${t.location})`,
    ),
    check(
      'users_avatar_shape_chk',
      sql`${t.avatar} IS NULL OR (jsonb_typeof(${t.avatar}) = 'object' AND coalesce(jsonb_typeof(${t.avatar}->'publicId'), '') = 'string')`,
    ),
    index('users_avatar_public_id_idx')
      .on(sql`(${t.avatar}->>'publicId')`)
      .where(sql`${t.avatar} IS NOT NULL`),
  ],
);

/** D419/D459: "First Last", else username, else "Member" (MEMBER_NAME); `id` keeps LEFT-JOINed nulls null. `display_name` is not read. */
export const displayNameSql = (
  t: Pick<typeof users, 'id' | 'firstName' | 'lastName' | 'username'> = users,
) =>
  sql<string>`coalesce(nullif(btrim(concat_ws(' ', ${t.firstName}, ${t.lastName})), ''), ${t.username}, CASE WHEN ${t.id} IS NOT NULL THEN ${MEMBER_NAME} END)`;
