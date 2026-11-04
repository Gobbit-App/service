import { and, eq, inArray, isNull, lte, sql } from 'drizzle-orm';
import {
  decks,
  items,
  itemColumns,
  notificationDeliveries,
  pushSubscriptions,
  reminders,
  users,
  type Db,
  type DbExecutor,
  type ItemRow,
} from '@gobbit/db';
import type { NotificationChannel } from '@gobbit/shared';
import { createRemindersRepo } from './reminders.repo';

/** A due reminder claimed by one sweep tick. */
export interface ClaimedReminder {
  item: ItemRow;
  deadline: Date;
}

/** A person the sweep may notify: their email choice and their devices. */
export interface Recipient {
  userId: string;
  reminderEmails: boolean;
  pushTargetIds: string[];
}

export interface DeliveryInsert {
  itemId: string;
  deadline: Date;
  userId: string;
  channel: NotificationChannel;
  /** `email`, or the push subscription id. */
  target: string;
}

/** A delivery claimed for sending, with what the message needs. */
export interface ClaimedDelivery {
  id: string;
  itemId: string;
  deadline: Date;
  userId: string;
  channel: NotificationChannel;
  target: string;
  attempts: number;
}

/** What a message says and whether it is still worth sending. */
export interface DeliveryContext {
  title: string;
  deckName: string;
  payload: Record<string, unknown>;
  email: string;
  /** False once the reminder was dismissed, unpublished, deleted or its deadline changed. */
  stillDue: boolean;
}

/** D295: a claimed send older than this was cut off mid-flight (crash, deploy). */
export const SENDING_STALE_MINUTES = 10;

/** The reads and writes of one planning transaction. */
function planningRepo(tx: DbExecutor) {
  const reminderReads = createRemindersRepo(tx);
  return {
    deckContext: reminderReads.deckContext,
    categoryVisibilities: reminderReads.categoryVisibilities,

    /**
     * D295: locks up to `batch` due reminders other ticks skip, and marks their current deadline
     * notified, so the same deadline is never planned twice.
     */
    async claimDue(batch: number): Promise<ClaimedReminder[]> {
      const rows = await tx
        .select({ itemId: reminders.itemId, deadline: reminders.deadline })
        .from(reminders)
        .innerJoin(items, eq(items.id, reminders.itemId))
        .innerJoin(decks, eq(decks.id, items.deckId))
        .where(
          and(
            eq(reminders.outcome, 'pending'),
            sql`${reminders.deadline} <= now()`,
            sql`${reminders.notifiedDeadline} is distinct from ${reminders.deadline}`,
            eq(items.status, 'published'),
            isNull(items.deletedAt),
            isNull(decks.deletedAt),
          ),
        )
        .orderBy(reminders.deadline)
        .limit(batch)
        .for('update', { of: reminders, skipLocked: true });
      if (rows.length === 0) return [];
      const ids = rows.map((r) => r.itemId);
      await tx
        .update(reminders)
        .set({ notifiedDeadline: sql`${reminders.deadline}` })
        .where(inArray(reminders.itemId, ids));
      const itemRows = await tx.select(itemColumns).from(items).where(inArray(items.id, ids));
      const byId = new Map(itemRows.map((r) => [r.id, r]));
      return rows.flatMap((r) => {
        const item = byId.get(r.itemId);
        return item ? [{ item, deadline: r.deadline }] : [];
      });
    },

    /** Live users among `userIds`, with their email choice and push devices. */
    async recipients(userIds: readonly string[]): Promise<Map<string, Recipient>> {
      const result = new Map<string, Recipient>();
      if (userIds.length === 0) return result;
      const people = await tx
        .select({ userId: users.id, reminderEmails: users.reminderEmails })
        .from(users)
        .where(and(inArray(users.id, [...userIds]), isNull(users.deletedAt)));
      for (const p of people) result.set(p.userId, { ...p, pushTargetIds: [] });
      const devices = await tx
        .select({ id: pushSubscriptions.id, userId: pushSubscriptions.userId })
        .from(pushSubscriptions)
        .where(inArray(pushSubscriptions.userId, [...result.keys()]));
      for (const d of devices) result.get(d.userId)?.pushTargetIds.push(d.id);
      return result;
    },

    /** D295: the unique key makes a second insert of the same delivery a no-op. */
    async insertDeliveries(rows: readonly DeliveryInsert[]): Promise<number> {
      if (rows.length === 0) return 0;
      const inserted = await tx
        .insert(notificationDeliveries)
        .values([...rows])
        .onConflictDoNothing()
        .returning({ id: notificationDeliveries.id });
      return inserted.length;
    },
  };
}

export type PlanningRepo = ReturnType<typeof planningRepo>;

export function createNotificationsRepo(db: Db) {
  return {
    /** D295: claim, plan and record in one transaction (all or nothing). */
    async planInTransaction<T>(fn: (repo: PlanningRepo) => Promise<T>): Promise<T> {
      return await db.transaction((tx) => fn(planningRepo(tx)));
    },

    /** D295: sends cut off mid-flight are never retried (at most once). */
    async markInterrupted(): Promise<
      Array<Pick<ClaimedDelivery, 'id' | 'itemId' | 'userId' | 'channel'>>
    > {
      const rows = await db
        .update(notificationDeliveries)
        .set({ status: 'interrupted', lastError: 'interrupted', updatedAt: sql`now()` })
        .where(
          and(
            eq(notificationDeliveries.status, 'sending'),
            sql`${notificationDeliveries.updatedAt} < now() - make_interval(mins => ${SENDING_STALE_MINUTES})`,
          ),
        )
        .returning({
          id: notificationDeliveries.id,
          itemId: notificationDeliveries.itemId,
          userId: notificationDeliveries.userId,
          channel: notificationDeliveries.channel,
        });
      return rows;
    },

    /** Ids of pending deliveries whose time has come, oldest first. */
    async duePending(limit: number): Promise<string[]> {
      const rows = await db
        .select({ id: notificationDeliveries.id })
        .from(notificationDeliveries)
        .where(
          and(
            eq(notificationDeliveries.status, 'pending'),
            lte(notificationDeliveries.nextAttemptAt, sql`now()`),
          ),
        )
        .orderBy(notificationDeliveries.nextAttemptAt)
        .limit(limit);
      return rows.map((r) => r.id);
    },

    /**
     * D295: `pending → sending` and one more attempt, committed before the send. Null when another
     * worker took it first.
     */
    async claim(id: string): Promise<ClaimedDelivery | null> {
      const [row] = await db
        .update(notificationDeliveries)
        .set({
          status: 'sending',
          attempts: sql`${notificationDeliveries.attempts} + 1`,
          updatedAt: sql`now()`,
        })
        .where(and(eq(notificationDeliveries.id, id), eq(notificationDeliveries.status, 'pending')))
        .returning({
          id: notificationDeliveries.id,
          itemId: notificationDeliveries.itemId,
          deadline: notificationDeliveries.deadline,
          userId: notificationDeliveries.userId,
          channel: notificationDeliveries.channel,
          target: notificationDeliveries.target,
          attempts: notificationDeliveries.attempts,
        });
      return row ?? null;
    },

    /** The message content, and whether the reminder still waits on this deadline. */
    async context(d: ClaimedDelivery): Promise<DeliveryContext | null> {
      const [row] = await db
        .select({
          title: items.title,
          payload: items.payload,
          status: items.status,
          itemDeleted: items.deletedAt,
          deckName: decks.name,
          deckDeleted: decks.deletedAt,
          email: users.email,
          outcome: reminders.outcome,
          deadline: reminders.deadline,
        })
        .from(items)
        .innerJoin(decks, eq(decks.id, items.deckId))
        .innerJoin(reminders, eq(reminders.itemId, items.id))
        .innerJoin(users, eq(users.id, d.userId))
        .where(eq(items.id, d.itemId))
        .limit(1);
      if (!row) return null;
      return {
        title: row.title,
        deckName: row.deckName,
        payload: row.payload,
        email: row.email,
        stillDue:
          row.status === 'published' &&
          row.itemDeleted === null &&
          row.deckDeleted === null &&
          row.outcome === 'pending' &&
          row.deadline.getTime() === d.deadline.getTime(),
      };
    },

    /** Records how a claimed send ended; `retryAt` puts it back in the queue. */
    async finish(
      id: string,
      v:
        | { status: 'sent' | 'failed' | 'gone'; error: string | null }
        | { status: 'pending'; error: string; retryAt: Date },
    ): Promise<void> {
      await db
        .update(notificationDeliveries)
        .set({
          status: v.status,
          lastError: v.error,
          updatedAt: sql`now()`,
          ...(v.status === 'pending' ? { nextAttemptAt: v.retryAt } : {}),
        })
        .where(
          and(eq(notificationDeliveries.id, id), eq(notificationDeliveries.status, 'sending')),
        );
    },
  };
}

export type NotificationsRepo = ReturnType<typeof createNotificationsRepo>;
