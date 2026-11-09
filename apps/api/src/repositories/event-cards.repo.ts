import { and, asc, eq, gt, inArray, isNull, lte, sql } from 'drizzle-orm';
import {
  eventCards,
  eventMutes,
  eventNotices,
  itemColumns,
  items,
  type DbExecutor,
  type DbTx,
  type EventCardRow,
  type ItemRow,
} from '@gobbit/db';
import type {
  EventNoticeMoment,
  EventNoticeSkipReason,
  EventNoticeState,
  EventNoticeUnit,
} from '@gobbit/shared/event-constants';

/** A notice of the event's current start, as the DTO shows it. */
export interface EventNoticeView {
  id: string;
  amount: number;
  unit: EventNoticeUnit;
  fireAt: Date;
  state: EventNoticeState;
}

/** The phase of a write that decides why a past moment is skipped (D359, FR-015). */
export type NoticeSkipReason = Extract<
  EventNoticeSkipReason,
  'past_at_save' | 'past_at_publish' | 'past_at_restore'
>;

/**
 * D359: brings the event's notices in line with `moments` inside the item's transaction:
 * 1. drops `pending` notices no longer wanted (a removed time, or the old start after a move);
 * 2. inserts the wanted ones, keeping any already there (a planned moment is never re-sent);
 * 3. marks every `pending` notice due by `now` as skipped with `reason`.
 * Planned and skipped rows are never deleted.
 */
export async function syncNotices(
  tx: DbTx,
  itemId: string,
  moments: readonly EventNoticeMoment[],
  now: Date,
  reason: NoticeSkipReason,
): Promise<void> {
  const wanted = moments.map(
    (m) => sql`(${m.startsAt.toISOString()}::timestamptz, ${m.amount}::int, ${m.unit}::text)`,
  );
  const stale =
    wanted.length === 0
      ? sql`true`
      : sql`(${eventNotices.startsAt}, ${eventNotices.beforeAmount}, ${eventNotices.beforeUnit}) NOT IN (${sql.join(wanted, sql`, `)})`;
  await tx
    .delete(eventNotices)
    .where(and(eq(eventNotices.itemId, itemId), eq(eventNotices.state, 'pending'), stale));

  if (moments.length > 0) {
    await tx
      .insert(eventNotices)
      .values(
        moments.map((m) => ({
          itemId,
          startsAt: m.startsAt,
          beforeAmount: m.amount,
          beforeUnit: m.unit,
          fireAt: m.fireAt,
        })),
      )
      .onConflictDoNothing({
        target: [
          eventNotices.itemId,
          eventNotices.startsAt,
          eventNotices.beforeAmount,
          eventNotices.beforeUnit,
        ],
      });
  }

  await tx
    .update(eventNotices)
    .set({ state: 'skipped', skipReason: reason })
    .where(
      and(
        eq(eventNotices.itemId, itemId),
        eq(eventNotices.state, 'pending'),
        lte(eventNotices.fireAt, now),
      ),
    );
}

/** D366: a live event whose first notice has fired and which hasn't ended. */
export interface ComingUpRow {
  item: ItemRow;
  span: Pick<EventCardRow, 'startsAt' | 'endsAt' | 'allDay' | 'timeZone'>;
}

/** 042: reads behind the `event` DTO field (span, current notices, the caller's mute). */
export function createEventCardsRepo(db: DbExecutor) {
  return {
    /** D358: the server-owned span of each event in `itemIds`. */
    async spans(itemIds: readonly string[]): Promise<Map<string, EventCardRow>> {
      if (itemIds.length === 0) return new Map();
      const rows = await db
        .select()
        .from(eventCards)
        .where(inArray(eventCards.itemId, [...itemIds]));
      return new Map(rows.map((r) => [r.itemId, r]));
    },

    /** D359: the notices of each event's current start, soonest first. */
    async currentNotices(itemIds: readonly string[]): Promise<Map<string, EventNoticeView[]>> {
      const result = new Map<string, EventNoticeView[]>(itemIds.map((id) => [id, []]));
      if (itemIds.length === 0) return result;
      const rows = await db
        .select({
          itemId: eventNotices.itemId,
          id: eventNotices.id,
          amount: eventNotices.beforeAmount,
          unit: eventNotices.beforeUnit,
          fireAt: eventNotices.fireAt,
          state: eventNotices.state,
        })
        .from(eventNotices)
        .innerJoin(
          eventCards,
          and(
            eq(eventCards.itemId, eventNotices.itemId),
            eq(eventCards.startsAt, eventNotices.startsAt),
          ),
        )
        .where(inArray(eventNotices.itemId, [...itemIds]))
        .orderBy(asc(eventNotices.fireAt));
      for (const { itemId, ...notice } of rows) {
        result.get(itemId)?.push({ ...notice, unit: notice.unit as EventNoticeUnit });
      }
      return result;
    },

    /** D364: the events among `itemIds` that `userId` has muted. */
    async mutedBy(userId: string, itemIds: readonly string[]): Promise<Set<string>> {
      if (itemIds.length === 0) return new Set();
      const rows = await db
        .select({ itemId: eventMutes.itemId })
        .from(eventMutes)
        .where(
          and(
            eq(eventMutes.userId, userId),
            eq(eventMutes.muted, true),
            inArray(eventMutes.itemId, [...itemIds]),
          ),
        );
      return new Set(rows.map((r) => r.itemId));
    },

    /**
     * D366: published events in `deckIds` with a notice of their current start due by now that
     * haven't ended, soonest start first. Audience, mute and visibility are filtered by the caller.
     */
    async comingUpIn(deckIds: readonly string[], limit: number): Promise<ComingUpRow[]> {
      if (deckIds.length === 0) return [];
      const rows = await db
        .select({
          item: itemColumns,
          startsAt: eventCards.startsAt,
          endsAt: eventCards.endsAt,
          allDay: eventCards.allDay,
          timeZone: eventCards.timeZone,
        })
        .from(items)
        .innerJoin(eventCards, eq(eventCards.itemId, items.id))
        .where(
          and(
            inArray(items.deckId, [...deckIds]),
            eq(items.type, 'event'),
            eq(items.status, 'published'),
            isNull(items.deletedAt),
            gt(eventCards.endsAt, sql`now()`),
            sql`exists (select 1 from ${eventNotices}
                          where ${eventNotices.itemId} = ${items.id}
                            and ${eventNotices.startsAt} = ${eventCards.startsAt}
                            and ${eventNotices.fireAt} <= now())`,
          ),
        )
        .orderBy(asc(eventCards.startsAt), asc(items.id))
        .limit(limit);
      return rows.map(({ item, ...span }) => ({ item, span }));
    },

    /** D364: one row per member and event; unmute keeps the row with `muted = false`. */
    async setMute(itemId: string, userId: string, muted: boolean): Promise<void> {
      await db
        .insert(eventMutes)
        .values({ itemId, userId, muted })
        .onConflictDoUpdate({
          target: [eventMutes.itemId, eventMutes.userId],
          set: { muted, updatedAt: sql`now()` },
        });
    },
  };
}

export type EventCardsRepo = ReturnType<typeof createEventCardsRepo>;
