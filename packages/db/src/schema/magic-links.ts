import { pgTable, uuid, text, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { magicLinkPurposeEnum, tstz } from './common';
import { memberships } from './memberships';

/** D23: single-use sign-in and invite links; only the sha256 of the token is stored. */
export const magicLinks = pgTable(
  'magic_links',
  {
    id: uuid().primaryKey().defaultRandom(),
    email: text().notNull(),
    tokenHash: text().notNull(),
    purpose: magicLinkPurposeEnum().notNull(),
    membershipId: uuid().references(() => memberships.id, { onDelete: 'cascade' }),
    next: text(),
    expiresAt: tstz().notNull(),
    usedAt: tstz(),
    requestedIp: text(),
    createdAt: tstz().notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('magic_links_token_hash_uq').on(t.tokenHash),
    index('magic_links_email_created_at_idx').on(t.email, t.createdAt),
  ],
);
