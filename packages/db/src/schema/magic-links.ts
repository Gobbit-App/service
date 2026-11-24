import { pgTable, uuid, text, index, uniqueIndex, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { magicLinkPurposeEnum, tstz } from './common';
import { memberships } from './memberships';
import { deckInviteLinks } from './deck-invite-links';

/** D23: single-use sign-in and invite links; only the sha256 of the token is stored. */
export const magicLinks = pgTable(
  'magic_links',
  {
    id: uuid().primaryKey().defaultRandom(),
    email: text().notNull(),
    tokenHash: text().notNull(),
    purpose: magicLinkPurposeEnum().notNull(),
    membershipId: uuid().references(() => memberships.id, { onDelete: 'cascade' }),
    inviteLinkId: uuid().references(() => deckInviteLinks.id, { onDelete: 'set null' }),
    next: text(),
    expiresAt: tstz().notNull(),
    usedAt: tstz(),
    requestedIp: text(),
    createdAt: tstz().notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('magic_links_token_hash_uq').on(t.tokenHash),
    index('magic_links_email_created_at_idx').on(t.email, t.createdAt),
    check(
      'magic_links_invite_link_sign_in',
      sql`${t.inviteLinkId} is null or ${t.purpose} = 'sign_in'`,
    ),
  ],
);
