import type { NewItemEventRow } from '@pb/db';
import {
  ITEM_EVENT_TITLE_MAX,
  itemEventKindsWithChanges,
  type ActorVia,
  type ItemEventField,
  type ItemEventKind,
} from '@pb/shared';
import type { Actor } from '../types';

/** D187: what a repository write logs; the deck, card and title come from the written row. */
export interface ItemEventInput {
  kind: ItemEventKind;
  via: ActorVia;
  actorUserId: string | null;
  /** Field names, kept only for the kinds that carry them (`updated`, `merged`). */
  changes?: readonly ItemEventField[];
}

/** D187: an event by the acting principal (ADR-050). */
export function eventFrom(
  actor: Actor,
  kind: ItemEventKind,
  changes?: readonly ItemEventField[],
): ItemEventInput {
  return { kind, via: actor.via, actorUserId: actor.user.id, changes };
}

const KINDS_WITH_CHANGES: readonly ItemEventKind[] = itemEventKindsWithChanges;

/** The `item_events` row for `event` on the card as written (title truncated by code points). */
export function toEventRow(
  item: { id: string; deckId: string; title: string },
  event: ItemEventInput,
): NewItemEventRow {
  const changes =
    KINDS_WITH_CHANGES.includes(event.kind) && event.changes && event.changes.length > 0
      ? [...event.changes]
      : null;
  return {
    deckId: item.deckId,
    itemId: item.id,
    actorUserId: event.actorUserId,
    via: event.via,
    kind: event.kind,
    title: Array.from(item.title).slice(0, ITEM_EVENT_TITLE_MAX).join(''),
    changes,
  };
}
