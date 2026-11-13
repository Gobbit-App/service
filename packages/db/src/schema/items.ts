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
import {
  CARD_BODY_MAX,
  ENTITIES_MAX_BYTES,
  PAYLOAD_DB_BACKSTOP_BYTES,
  EMBEDDING_DIMS,
  type Entities,
} from '@gobbit/shared';
import { EVENT_LOCATION_MAX, EVENT_NOTIFY_TIMES_MAX } from '@gobbit/shared/event-constants';
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
    /** D97: extracted facts (phones, addresses, …); part of search_text. */
    entities: jsonb().$type<Entities>().notNull().default({}),
    ...timestamps,
    // D69/D70/D97: normalized title + body + payload strings + entities; item_search_text() in 0009_ingest.
    searchText: text()
      .notNull()
      .generatedAlwaysAs(sql`item_search_text("type", "title", "body", "payload", "entities")`),
    // D74: written only by the embed-item job.
    embedding: vector({ dimensions: EMBEDDING_DIMS }),
    embeddingModel: text(),
    embeddedHash: text(),
    embeddedAt: tstz(),
    /** D291: reminders only — deadline minus show-before; set by trigger `items_reminder_sync`. */
    revealAt: tstz(),
  },
  (t) => [
    unique('items_id_deck_uq').on(t.id, t.deckId),
    index('items_list_idx').on(t.deckId, t.status, t.createdAt.desc(), t.id.desc()),
    // D132: the deleted listing (per deck, newest first) and the weekly purge.
    index('items_deleted_idx')
      .on(t.deckId, t.deletedAt.desc(), t.id.desc())
      .where(sql`${t.deletedAt} IS NOT NULL`),
    // D292: hidden reminders per deck (the Upcoming list and the reveal test).
    index('items_reveal_idx')
      .on(t.deckId, t.revealAt)
      .where(sql`${t.revealAt} IS NOT NULL`),
    // D291: only reminders have a reveal time (text compare: the enum value is new in 0021).
    check('items_reveal_at_chk', sql`(${t.type}::text = 'reminder') = (${t.revealAt} IS NOT NULL)`),
    // D356: the event payload backstop (text compare: the enum value is new in 0022).
    check(
      'items_event_payload_chk',
      sql`${t.type}::text <> 'event' OR coalesce(jsonb_typeof(${t.payload}->'allDay') = 'boolean' AND jsonb_typeof(${t.payload}->'start') = 'string' AND jsonb_typeof(${t.payload}->'timeZone') = 'string' AND (NOT ${t.payload} ? 'location' OR char_length(${t.payload}->>'location') <= ${sql.raw(String(EVENT_LOCATION_MAX))}) AND jsonb_typeof(${t.payload}#>'{notify,before}') = 'array' AND jsonb_array_length(${t.payload}#>'{notify,before}') <= ${sql.raw(String(EVENT_NOTIFY_TIMES_MAX))}, false)`,
    ),
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
    check(
      'items_entities_chk',
      sql`jsonb_typeof(${t.entities}) = 'object' AND octet_length(${t.entities}::text) <= ${sql.raw(String(ENTITIES_MAX_BYTES))}`,
    ),
  ],
);

/** Every column except the 1536-float embedding, which only the search and embedding code read (D74). */
const { embedding: _embedding, ...itemReadColumnsAll } = getTableColumns(items);
export const itemColumns = itemReadColumnsAll;
