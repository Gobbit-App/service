import {
  decodeCursor,
  encodeCursor,
  type ItemEvent,
  type ItemEventListQuery,
  type ItemEventPage,
} from '@pb/shared';
import { authorize, type MembershipLookup } from '../access/authorize';
import { resolveDeck } from '../lib/resolve-deck';
import type { DecksRepo } from '../repositories/decks.repo';
import type { ItemEventsRepo, ItemEventWithActor } from '../repositories/item-events.repo';
import type { Actor } from '../types';

function toDto(row: ItemEventWithActor): ItemEvent {
  return {
    id: row.id,
    itemId: row.itemId,
    title: row.title,
    kind: row.kind,
    via: row.via,
    // D188: a deleted account (or its removed row) reads "Former member" in the PWA.
    actor:
      row.actorUserId && row.actorName !== null
        ? { userId: row.actorUserId, displayName: row.actorName }
        : null,
    changes: row.changes ?? [],
    createdAt: row.createdAt.toISOString(),
  };
}

/** D188: the deck's activity log for owners and maintainers (`event.list`). */
export function createEventsService(deps: {
  decks: DecksRepo;
  memberships: MembershipLookup;
  events: ItemEventsRepo;
}) {
  const { decks, memberships, events } = deps;

  return {
    async list(actor: Actor, idOrSlug: string, q: ItemEventListQuery): Promise<ItemEventPage> {
      const deck = await resolveDeck(decks, idOrSlug, actor.user);
      await authorize(actor.user, deck, 'event.list', memberships);

      const rows = await events.list({
        deckId: deck.id,
        itemId: q.itemId,
        cursor: q.cursor ? decodeCursor(q.cursor) : undefined,
        limit: q.limit + 1,
      });
      const page = rows.slice(0, q.limit);
      const last = page[page.length - 1];
      return {
        data: page.map(toDto),
        nextCursor: rows.length > q.limit && last ? encodeCursor(last) : null,
      };
    },
  };
}

export type EventsService = ReturnType<typeof createEventsService>;
