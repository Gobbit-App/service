import {
  decodeCursor,
  encodeCursor,
  type ItemEvent,
  type ItemEventListQuery,
  type ItemEventPage,
  type MemberSummary,
} from '@gobbit/shared';
import { authorize, type MembershipLookup } from '../access/authorize';
import { resolveDeck } from '../lib/resolve-deck';
import type { DecksRepo } from '../repositories/decks.repo';
import type { ItemEventsRepo, ItemEventWithActor } from '../repositories/item-events.repo';
import type { Actor } from '../types';
import type { MemberSummaries } from './member-summaries';

function toDto(row: ItemEventWithActor, people: Map<string, MemberSummary>): ItemEvent {
  return {
    id: row.id,
    itemId: row.itemId,
    title: row.title,
    kind: row.kind,
    via: row.via,
    // D188: a deleted account (or its removed row) reads "Former member" in the PWA.
    actor:
      row.actorUserId && row.actorName !== null
        ? {
            userId: row.actorUserId,
            displayName: row.actorName,
            username: people.get(row.actorUserId)?.username ?? null,
            initials: people.get(row.actorUserId)?.initials ?? '',
            photo: people.get(row.actorUserId)?.photo ?? null,
          }
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
  summaries: MemberSummaries;
}) {
  const { decks, memberships, events, summaries } = deps;

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
      const people = await summaries.summaries(page.flatMap((r) => r.actorUserId ?? []));
      return {
        data: page.map((r) => toDto(r, people)),
        nextCursor: rows.length > q.limit && last ? encodeCursor(last) : null,
      };
    },
  };
}

export type EventsService = ReturnType<typeof createEventsService>;
