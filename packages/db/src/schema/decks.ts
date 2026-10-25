import { pgTable, uuid, text, boolean, check, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { deckKindEnum, timestamps } from './common';
import { accounts } from './accounts';

export const decks = pgTable(
  'decks',
  {
    id: uuid().primaryKey().defaultRandom(),
    kind: deckKindEnum().notNull(),
    slug: text().notNull(),
    name: text().notNull(),
    ownerAccountId: uuid()
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    isPublic: boolean().notNull().default(false),
    isDefault: boolean().notNull().default(false), // personal-deck
    /** D192: publishers' shares skip review when they pass the reviewer's checks. */
    autoPublishShares: boolean().notNull().default(false),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('decks_slug_active_uq')
      .on(t.slug)
      .where(sql`deleted_at is null`),
    uniqueIndex('decks_default_per_account_uq')
      .on(t.ownerAccountId)
      .where(sql`is_default AND deleted_at IS NULL`), // personal-deck
    check('decks_default_is_personal', sql`(NOT ${t.isDefault} OR ${t.kind} = 'personal')`), // personal-deck
    check('decks_slug_not_reserved', sql`${t.slug} <> 'me'`), // personal-deck
  ],
);
