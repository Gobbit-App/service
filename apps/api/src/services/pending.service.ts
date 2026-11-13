import type { DeckRow } from '@gobbit/db';
import type { MemberRole } from '@gobbit/shared';
import {
  PENDING_LIST_MAX,
  canStillAct,
  isOverdue,
  reminderDismissers,
  type DismisserMember,
  type PendingItem,
  type PendingList,
} from '@gobbit/shared/reminders';
import type { DecksRepo } from '../repositories/decks.repo';
import type { EventCardsRepo } from '../repositories/event-cards.repo';
import type { PendingReminderRow, RemindersRepo } from '../repositories/reminders.repo';
import type { CurrentUser } from '../types';
import { comingUpFor } from './pending.coming-up';
import { storedPayload } from './reminders.service';

/** D298: rows scanned per call before filtering by who may act (keeps the query bounded). */
export const PENDING_SCAN_MAX = 1000;

type DeckContext = { personal: boolean; members: DismisserMember[] };

function toPendingItem(row: PendingReminderRow, deck: DeckRow, now: Date): PendingItem {
  return {
    kind: 'reminder',
    itemId: row.item.id,
    title: row.item.title,
    deck: { slug: deck.slug, name: deck.name },
    deadline: row.deadline.toISOString(),
    revealAt: row.item.revealAt!.toISOString(),
    overdue: isOverdue(row.deadline, now),
  };
}

/**
 * D298: what is waiting on the member across their decks (FR-021–FR-023): revealed reminders they
 * may dismiss (`reminderDismissers`, the same rule as dismiss and the notifier) and the hidden ones
 * they created while they can still act on them. D366: plus the events notifying them now.
 */
export function createPendingService(deps: {
  decks: Pick<DecksRepo, 'listForUser'>;
  reminders: Pick<RemindersRepo, 'pendingIn' | 'deckContext' | 'categoryVisibilities'>;
  events: Pick<EventCardsRepo, 'comingUpIn' | 'mutedBy'>;
  now?: () => Date;
}) {
  const { decks, reminders, events, now = () => new Date() } = deps;

  return {
    async list(user: CurrentUser): Promise<PendingList> {
      const memberOf = await decks.listForUser(user.id, user.accountId);
      const deckById = new Map(memberOf.map((d) => [d.deck.id, d.deck]));
      const roleByDeck = new Map<string, MemberRole>(memberOf.map((d) => [d.deck.id, d.role]));

      const [rows, eventRows] = await Promise.all([
        reminders.pendingIn([...deckById.keys()], PENDING_SCAN_MAX),
        events.comingUpIn([...deckById.keys()], PENDING_SCAN_MAX),
      ]);
      if (rows.length === 0 && eventRows.length === 0) {
        return { items: [], upcoming: [], comingUp: [] };
      }

      const itemsOf = [...rows, ...eventRows].map((r) => r.item);
      const deckIds = [...new Set(itemsOf.map((i) => i.deckId))];
      const [contexts, visibilities, muted] = await Promise.all([
        Promise.all(deckIds.map(async (id) => [id, await reminders.deckContext(id)] as const)),
        reminders.categoryVisibilities(itemsOf.map((i) => i.id)),
        events.mutedBy(
          user.id,
          eventRows.map((r) => r.item.id),
        ),
      ]);
      const contextOf = new Map<string, DeckContext>(contexts);

      const at = now();
      const items: PendingItem[] = [];
      const upcoming: PendingItem[] = [];
      for (const row of rows) {
        const { item } = row;
        const deck = deckById.get(item.deckId);
        const ctx = contextOf.get(item.deckId);
        const role = roleByDeck.get(item.deckId);
        if (!deck || !ctx || !role || !item.revealAt) continue;
        const cardVisibilities = visibilities.get(item.id) ?? [];

        if (item.revealAt.getTime() > at.getTime()) {
          const mine = item.createdBy === user.id;
          if (mine && canStillAct({ userId: user.id, role }, cardVisibilities)) {
            upcoming.push(toPendingItem(row, deck, at));
          }
          continue;
        }
        const payload = storedPayload(item);
        const dismissers = reminderDismissers({
          mode: payload.dismiss.mode,
          userIds: payload.dismiss.userIds,
          createdBy: item.createdBy,
          members: ctx.members,
          categoryVisibilities: cardVisibilities,
          personalDeck: ctx.personal,
        });
        if (dismissers.includes(user.id)) items.push(toPendingItem(row, deck, at));
      }

      upcoming.sort((a, b) => Date.parse(a.revealAt) - Date.parse(b.revealAt));
      return {
        items: items.slice(0, PENDING_LIST_MAX),
        upcoming: upcoming.slice(0, PENDING_LIST_MAX),
        comingUp: comingUpFor({
          userId: user.id,
          rows: eventRows,
          decks: deckById,
          contexts: contextOf,
          visibilities,
          muted,
          max: PENDING_LIST_MAX,
        }),
      };
    },
  };
}

export type PendingService = ReturnType<typeof createPendingService>;
