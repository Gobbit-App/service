import {
  check,
  index,
  jsonb,
  pgTable,
  text,
  unique,
  uuid,
  varchar,
  vector,
} from 'drizzle-orm/pg-core';
import { getTableColumns, sql } from 'drizzle-orm';
import { CARD_BODY_MAX, PAYLOAD_DB_BACKSTOP_BYTES, EMBEDDING_DIMS } from '@pb/shared';
import { itemStatusEnum, itemTypeEnum, sourceKindEnum, timestamps, tstz } from './common';
import { users } from './users';
import { decks } from './decks';

export const items = pgTable(
  'items',
  {
    id: uuid().primaryKey().defaultRandom(),
    deckId: uuid()
      .notNull()
      .references(() => decks.id, { onDelete: 'cascade' }),
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
    // D69/D70: normalized title + body + payload strings; item_search_text() lives in 0008_search.
    searchText: text()
      .notNull()
      .generatedAlwaysAs(sql`item_search_text("type", "title", "body", "payload")`),
    // D74: written only by the embed-item job.
    embedding: vector({ dimensions: EMBEDDING_DIMS }),
    embeddingModel: text(),
    embeddedHash: text(),
    embeddedAt: tstz(),
  },
  (t) => [
    unique('items_id_deck_uq').on(t.id, t.deckId),
    index('items_list_idx').on(t.deckId, t.status, t.createdAt.desc(), t.id.desc()),
    index('items_search_trgm_idx').using('gin', t.searchText.op('gin_trgm_ops')),
    index('items_embedding_hnsw_idx')
      .using('hnsw', t.embedding.op('vector_cosine_ops'))
      .with({ m: 16, ef_construction: 64 }),
    check('items_body_len_chk', sql`char_length(${t.body}) <= ${sql.raw(String(CARD_BODY_MAX))}`), // card-limits
    check(
      'items_payload_size_chk',
      sql`octet_length(${t.payload}::text) <= ${sql.raw(String(PAYLOAD_DB_BACKSTOP_BYTES))}`,
    ), // card-limits
    check('items_payload_object_chk', sql`jsonb_typeof(${t.payload}) = 'object'`), // card-limits
  ],
);

/** Every column except the 1536-float embedding, which only the search and embedding code read (D74). */
const { embedding: _embedding, ...itemReadColumnsAll } = getTableColumns(items);
export const itemColumns = itemReadColumnsAll;
