import { boolean, check, index, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tstz } from './common';
import { decks } from './decks';
import { items } from './items';

/**
 * D358: the span of an event card, 1:1 with the item. Written only by trigger `items_event_sync`
 * (mirrors `eventSpan` in `@gobbit/shared/events-cards`): `ends_at` is the exclusive effective end.
 */
export const eventCards = pgTable(
  'event_cards',
  {
    itemId: uuid()
      .primaryKey()
      .references(() => items.id, { onDelete: 'cascade' }),
    deckId: uuid()
      .notNull()
      .references(() => decks.id, { onDelete: 'cascade' }),
    allDay: boolean().notNull(),
    startsAt: tstz().notNull(),
    endsAt: tstz().notNull(),
    timeZone: text().notNull(),
    updatedAt: tstz().notNull().defaultNow(),
  },
  (t) => [
    index('event_cards_ends_idx').on(t.endsAt),
    index('event_cards_deck_idx').on(t.deckId),
    check('event_cards_span_chk', sql`${t.endsAt} > ${t.startsAt}`),
  ],
);
