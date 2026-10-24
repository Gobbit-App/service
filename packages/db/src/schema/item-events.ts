import { check, index, pgEnum, pgTable, text, uuid, varchar } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { ITEM_EVENT_TITLE_MAX, actorVias, itemEventKinds } from '@pb/shared';
import { tstz } from './common';
import { decks } from './decks';
import { items } from './items';
import { users } from './users';

export const actorViaEnum = pgEnum('actor_via', actorVias);
export const itemEventKindEnum = pgEnum('item_event_kind', itemEventKinds);

/**
 * D186 (ADR-057): append-only log of card changes. A line survives the card's purge (`item_id`
 * set null) and its actor's deletion (`actor_user_id` set null); `title` is the snapshot after the
 * change and `changes` lists field names only, never content.
 */
export const itemEvents = pgTable(
  'item_events',
  {
    id: uuid().primaryKey().defaultRandom(),
    deckId: uuid()
      .notNull()
      .references(() => decks.id, { onDelete: 'cascade' }),
    itemId: uuid().references(() => items.id, { onDelete: 'set null' }),
    actorUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    via: actorViaEnum().notNull(),
    kind: itemEventKindEnum().notNull(),
    title: varchar({ length: ITEM_EVENT_TITLE_MAX }).notNull(),
    changes: text().array(),
    createdAt: tstz().notNull().defaultNow(),
  },
  (t) => [
    index('item_events_deck_created_idx').on(t.deckId, t.createdAt.desc(), t.id.desc()),
    index('item_events_item_created_idx').on(t.itemId, t.createdAt.desc()),
    check(
      'item_events_changes_chk',
      sql`${t.changes} IS NULL OR ${t.kind} IN ('updated', 'merged')`,
    ),
  ],
);
