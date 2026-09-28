import { pgTable, uuid, text, boolean, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { pocketbookKindEnum, timestamps } from './common';
import { accounts } from './accounts';

export const pocketbooks = pgTable(
  'pocketbooks',
  {
    id: uuid().primaryKey().defaultRandom(),
    kind: pocketbookKindEnum().notNull(),
    slug: text().notNull(),
    name: text().notNull(),
    ownerAccountId: uuid()
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    isPublic: boolean().notNull().default(false),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('pocketbooks_slug_active_uq')
      .on(t.slug)
      .where(sql`deleted_at is null`),
  ],
);
