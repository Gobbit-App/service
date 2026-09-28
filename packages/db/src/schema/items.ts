import { check, index, jsonb, pgTable, text, unique, uuid, varchar } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { CARD_BODY_MAX, PAYLOAD_DB_BACKSTOP_BYTES } from '@pb/shared';
import { itemStatusEnum, itemTypeEnum, sourceKindEnum, timestamps, tstz } from './common';
import { users } from './users';
import { pocketbooks } from './pocketbooks';

export const items = pgTable(
  'items',
  {
    id: uuid().primaryKey().defaultRandom(),
    pocketbookId: uuid()
      .notNull()
      .references(() => pocketbooks.id, { onDelete: 'cascade' }),
    type: itemTypeEnum().notNull(),
    status: itemStatusEnum().notNull().default('published'),
    title: varchar({ length: 120 }).notNull(),
    body: text().notNull().default(''),
    payload: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    sourceUrl: text(),
    sourceKind: sourceKindEnum().notNull().default('manual'),
    verifiedAt: tstz(),
    createdBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [
    unique('items_id_pocketbook_uq').on(t.id, t.pocketbookId),
    index('items_list_idx').on(t.pocketbookId, t.status, t.createdAt.desc(), t.id.desc()),
    check('items_body_len_chk', sql`char_length(${t.body}) <= ${sql.raw(String(CARD_BODY_MAX))}`), // card-limits
    check(
      'items_payload_size_chk',
      sql`octet_length(${t.payload}::text) <= ${sql.raw(String(PAYLOAD_DB_BACKSTOP_BYTES))}`,
    ), // card-limits
    check('items_payload_object_chk', sql`jsonb_typeof(${t.payload}) = 'object'`), // card-limits
  ],
);
