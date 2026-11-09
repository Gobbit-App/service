import type { DeckRow } from '@gobbit/db';
import type { CategoryVisibility } from '@gobbit/shared';
import type { ComingUpEntry } from '@gobbit/shared/reminders';
import type { ComingUpRow } from '../repositories/event-cards.repo';
import { storedEventPayload } from './event-cards.service';
import { audienceOf, type AudienceContext } from './notify.event-plan';

function toEntry(row: ComingUpRow, deck: DeckRow): ComingUpEntry {
  const { item, span } = row;
  return {
    kind: 'event',
    itemId: item.id,
    title: item.title,
    deck: { slug: deck.slug, name: deck.name },
    startsAt: span.startsAt.toISOString(),
    endsAt: span.endsAt.toISOString(),
    allDay: span.allDay,
    timeZone: span.timeZone,
    location: storedEventPayload(item).location ?? null,
  };
}

/**
 * D366: the events among `rows` (already in their notify window, soonest start first) that notify
 * `userId`: in the audience (the same rule as the notifier, D362) and not muted.
 */
export function comingUpFor(input: {
  userId: string;
  rows: readonly ComingUpRow[];
  decks: ReadonlyMap<string, DeckRow>;
  contexts: ReadonlyMap<string, AudienceContext>;
  visibilities: ReadonlyMap<string, CategoryVisibility[]>;
  muted: ReadonlySet<string>;
  max: number;
}): ComingUpEntry[] {
  const entries: ComingUpEntry[] = [];
  for (const row of input.rows) {
    if (entries.length >= input.max) break;
    const { item } = row;
    const deck = input.decks.get(item.deckId);
    const ctx = input.contexts.get(item.deckId);
    if (!deck || !ctx || input.muted.has(item.id)) continue;
    const audience = audienceOf(item, ctx, input.visibilities.get(item.id) ?? []);
    if (audience.includes(input.userId)) entries.push(toEntry(row, deck));
  }
  return entries;
}
