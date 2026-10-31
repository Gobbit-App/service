import { and, desc, eq, isNull, sql, type SQL } from 'drizzle-orm';
import { itemEvents, users, type DbExecutor, type ItemEventRow } from '@gobbit/db';
import type { CursorData } from '@gobbit/shared';
import { toEventRow, type ItemEventInput } from '../events/item-event';

/** A log line with its actor's name; `actorName` is null for a deleted account ("Former member"). */
export type ItemEventWithActor = ItemEventRow & { actorName: string | null };

/**
 * D187: inserts the events for one written card on `db` — the caller's transaction, so a line
 * exists exactly when the write commits. `now()` is the transaction's start, so lines of one
 * write are spaced a millisecond apart to keep their order (an `updated` before its `published`).
 */
export async function insertItemEvents(
  db: DbExecutor,
  item: { id: string; deckId: string; title: string },
  events: readonly ItemEventInput[],
): Promise<void> {
  if (events.length === 0) return;
  await db.insert(itemEvents).values(
    events.map((e, i) => ({
      ...toEventRow(item, e),
      createdAt: sql`now() + ${i} * interval '1 millisecond'`,
    })),
  );
}

export function createItemEventsRepo(db: DbExecutor) {
  return {
    /** D188: the deck's lines newest first, keyset on `(created_at, id)`; `itemId` narrows to one card. */
    async list(q: {
      deckId: string;
      itemId?: string;
      cursor?: CursorData;
      limit: number;
    }): Promise<ItemEventWithActor[]> {
      const conditions: SQL[] = [eq(itemEvents.deckId, q.deckId)];
      if (q.itemId) conditions.push(eq(itemEvents.itemId, q.itemId));
      if (q.cursor) {
        conditions.push(
          sql`(${itemEvents.createdAt}, ${itemEvents.id}) < (${q.cursor.createdAt}::timestamptz, ${q.cursor.id}::uuid)`,
        );
      }

      return db
        .select({
          id: itemEvents.id,
          deckId: itemEvents.deckId,
          itemId: itemEvents.itemId,
          actorUserId: itemEvents.actorUserId,
          via: itemEvents.via,
          kind: itemEvents.kind,
          title: itemEvents.title,
          changes: itemEvents.changes,
          createdAt: itemEvents.createdAt,
          actorName: users.displayName,
        })
        .from(itemEvents)
        .leftJoin(users, and(eq(users.id, itemEvents.actorUserId), isNull(users.deletedAt)))
        .where(and(...conditions))
        .orderBy(desc(itemEvents.createdAt), desc(itemEvents.id))
        .limit(q.limit);
    },
  };
}

export type ItemEventsRepo = ReturnType<typeof createItemEventsRepo>;
