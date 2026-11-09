import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  decks,
  eventCards,
  eventMutes,
  eventNotices,
  items,
  itemColumns,
  users,
  type DbExecutor,
  type ItemRow,
} from '@gobbit/db';

/** A due notice claimed by one sweep tick (D360). */
export interface ClaimedNotice {
  noticeId: string;
  item: ItemRow;
  fireAt: Date;
  startsAt: Date;
}

/** What `claimDueNotices` did: notices to fan out and those found too late. */
export interface NoticeClaim {
  planned: ClaimedNotice[];
  /** Past `greatest(starts_at, fire_at) + grace`: now `skipped / started`. */
  started: Array<{ noticeId: string; itemId: string }>;
}

/** An event delivery's message content and what decides whether it is still worth sending. */
export interface EventDeliveryFacts {
  title: string;
  deckId: string;
  deckName: string;
  createdBy: string | null;
  payload: Record<string, unknown>;
  email: string;
  startsAt: Date;
  allDay: boolean;
  timeZone: string;
  /** Published, live item and deck, and the notice `planned` for the event's current start. */
  live: boolean;
  muted: boolean;
}

/** D360: the event half of a planning transaction. */
export function eventPlanningRepo(tx: DbExecutor) {
  return {
    /**
     * D360: locks up to `batch` due `pending` notices of the current start of published, live
     * events (other ticks skip them). In grace they become `planned`, later ones `skipped / started`.
     */
    async claimDueNotices(batch: number, graceMinutes: number): Promise<NoticeClaim> {
      const rows = await tx
        .select({
          noticeId: eventNotices.id,
          itemId: eventNotices.itemId,
          fireAt: eventNotices.fireAt,
          startsAt: eventNotices.startsAt,
          late: sql<boolean>`now() >= greatest(${eventNotices.startsAt}, ${eventNotices.fireAt}) + make_interval(mins => ${graceMinutes})`,
        })
        .from(eventNotices)
        .innerJoin(
          eventCards,
          and(
            eq(eventCards.itemId, eventNotices.itemId),
            eq(eventCards.startsAt, eventNotices.startsAt),
          ),
        )
        .innerJoin(items, eq(items.id, eventNotices.itemId))
        .innerJoin(decks, eq(decks.id, items.deckId))
        .where(
          and(
            eq(eventNotices.state, 'pending'),
            sql`${eventNotices.fireAt} <= now()`,
            eq(items.status, 'published'),
            isNull(items.deletedAt),
            isNull(decks.deletedAt),
          ),
        )
        .orderBy(eventNotices.fireAt)
        .limit(batch)
        .for('update', { of: eventNotices, skipLocked: true });
      if (rows.length === 0) return { planned: [], started: [] };

      const late = rows.filter((r) => r.late);
      const due = rows.filter((r) => !r.late);
      if (late.length > 0) {
        await tx
          .update(eventNotices)
          .set({ state: 'skipped', skipReason: 'started', updatedAt: sql`now()` })
          .where(
            inArray(
              eventNotices.id,
              late.map((r) => r.noticeId),
            ),
          );
      }
      if (due.length === 0) {
        return { planned: [], started: late.map(({ noticeId, itemId }) => ({ noticeId, itemId })) };
      }
      await tx
        .update(eventNotices)
        .set({ state: 'planned', plannedAt: sql`now()`, updatedAt: sql`now()` })
        .where(
          inArray(
            eventNotices.id,
            due.map((r) => r.noticeId),
          ),
        );
      const itemRows = await tx
        .select(itemColumns)
        .from(items)
        .where(inArray(items.id, [...new Set(due.map((r) => r.itemId))]));
      const byId = new Map(itemRows.map((r) => [r.id, r]));
      return {
        planned: due.flatMap((r) => {
          const item = byId.get(r.itemId);
          return item
            ? [{ noticeId: r.noticeId, item, fireAt: r.fireAt, startsAt: r.startsAt }]
            : [];
        }),
        started: late.map(({ noticeId, itemId }) => ({ noticeId, itemId })),
      };
    },

    /** D364: who among `userIds` has muted the event right now. */
    async mutedAmong(itemId: string, userIds: readonly string[]): Promise<Set<string>> {
      if (userIds.length === 0) return new Set();
      const rows = await tx
        .select({ userId: eventMutes.userId })
        .from(eventMutes)
        .where(
          and(
            eq(eventMutes.itemId, itemId),
            eq(eventMutes.muted, true),
            inArray(eventMutes.userId, [...userIds]),
          ),
        );
      return new Set(rows.map((r) => r.userId));
    },
  };
}

export type EventPlanningRepo = ReturnType<typeof eventPlanningRepo>;

/**
 * D361: the facts behind an event delivery's `stillDue`, read just before the send. Null when the
 * item, the notice or the person is gone.
 */
export async function eventDeliveryFacts(
  db: DbExecutor,
  d: { itemId: string; noticeId: string; userId: string },
): Promise<EventDeliveryFacts | null> {
  const [row] = await db
    .select({
      title: items.title,
      payload: items.payload,
      createdBy: items.createdBy,
      status: items.status,
      itemDeleted: items.deletedAt,
      deckId: decks.id,
      deckName: decks.name,
      deckDeleted: decks.deletedAt,
      email: users.email,
      noticeState: eventNotices.state,
      noticeStartsAt: eventNotices.startsAt,
      startsAt: eventCards.startsAt,
      allDay: eventCards.allDay,
      timeZone: eventCards.timeZone,
      muted: sql<boolean>`coalesce(${eventMutes.muted}, false)`,
    })
    .from(eventNotices)
    .innerJoin(items, eq(items.id, eventNotices.itemId))
    .innerJoin(decks, eq(decks.id, items.deckId))
    .innerJoin(eventCards, eq(eventCards.itemId, items.id))
    .innerJoin(users, and(eq(users.id, d.userId), isNull(users.deletedAt)))
    .leftJoin(eventMutes, and(eq(eventMutes.itemId, items.id), eq(eventMutes.userId, d.userId)))
    .where(and(eq(eventNotices.id, d.noticeId), eq(eventNotices.itemId, d.itemId)))
    .limit(1);
  if (!row) return null;
  return {
    title: row.title,
    deckId: row.deckId,
    deckName: row.deckName,
    createdBy: row.createdBy,
    payload: row.payload,
    email: row.email,
    startsAt: row.startsAt,
    allDay: row.allDay,
    timeZone: row.timeZone,
    live:
      row.status === 'published' &&
      row.itemDeleted === null &&
      row.deckDeleted === null &&
      row.noticeState === 'planned' &&
      row.noticeStartsAt.getTime() === row.startsAt.getTime(),
    muted: row.muted,
  };
}
