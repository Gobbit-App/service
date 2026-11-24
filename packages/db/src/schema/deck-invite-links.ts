import { pgTable, uuid, text, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { memberRoleEnum, tstz } from './common';
import { decks } from './decks';
import { users } from './users';

/** D466/D467 (052): a shareable invite link; state is derived from the timestamps. */
export const deckInviteLinks = pgTable(
  'deck_invite_links',
  {
    id: uuid().primaryKey().defaultRandom(),
    deckId: uuid()
      .notNull()
      .references(() => decks.id, { onDelete: 'cascade' }),
    token: text().notNull().unique(),
    name: text().notNull(),
    role: memberRoleEnum().notNull(),
    createdBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    expiresAt: tstz().notNull(),
    acceptedAt: tstz(),
    acceptedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    revokedAt: tstz(),
    revokedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    createdAt: tstz().notNull().defaultNow(),
    updatedAt: tstz().notNull().defaultNow(),
  },
  (t) => [
    check('deck_invite_links_name_len', sql`char_length(${t.name}) between 1 and 60`),
    check('deck_invite_links_role_not_owner', sql`${t.role} <> 'owner'`),
    check('deck_invite_links_one_outcome', sql`num_nonnulls(${t.acceptedAt}, ${t.revokedAt}) <= 1`),
    check(
      'deck_invite_links_accepted_by',
      sql`${t.acceptedAt} is not null or ${t.acceptedBy} is null`,
    ),
    index('deck_invite_links_deck_created_idx').on(t.deckId, t.createdAt.desc()),
  ],
);
