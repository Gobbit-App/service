import { and, eq, gt, lt, ne, sql } from 'drizzle-orm';
import type { WaitlistEventAction, WaitlistKind, WaitlistSource } from '@pb/shared';
import {
  waitlistEntries,
  waitlistEvents,
  type DbExecutor,
  type WaitlistEntryRow,
  type WaitlistEventRow,
} from '@pb/db';

export interface NewPendingEntry {
  email: string;
  kind: WaitlistKind;
  note: string | null;
  source: WaitlistSource;
  utmSource: string | null;
  confirmTokenHash: string;
  confirmExpiresAt: Date;
}

/** Form fields a `landing` re-join may update (D218); a `sign_in` re-join keeps them. */
export interface PendingRefresh {
  confirmTokenHash: string;
  confirmExpiresAt: Date;
  fields?: { kind: WaitlistKind; note: string | null; utmSource: string | null };
}

export interface NewWaitlistEvent {
  entryId: string;
  action: WaitlistEventAction;
  actorId?: string | null;
  source?: WaitlistSource | null;
}

const live = ne(waitlistEntries.status, 'removed');

/** D217: every status change goes through `waitlist.service`; this module is SQL only. */
export function createWaitlistRepo(db: DbExecutor) {
  return {
    async findLiveByEmail(email: string): Promise<WaitlistEntryRow | null> {
      const [row] = await db
        .select()
        .from(waitlistEntries)
        .where(and(eq(waitlistEntries.email, email), live))
        .limit(1);
      return row ?? null;
    },

    async findById(id: string): Promise<WaitlistEntryRow | null> {
      const [row] = await db
        .select()
        .from(waitlistEntries)
        .where(eq(waitlistEntries.id, id))
        .limit(1);
      return row ?? null;
    },

    /** Null when a concurrent join already holds the live entry for this email. */
    async insertPending(v: NewPendingEntry): Promise<WaitlistEntryRow | null> {
      const [row] = await db
        .insert(waitlistEntries)
        .values({ ...v, status: 'pending' })
        .onConflictDoNothing({
          target: waitlistEntries.email,
          where: sql`${waitlistEntries.status} <> 'removed'`,
        })
        .returning();
      return row ?? null;
    },

    /** New token (the old one stops working); null when the entry is no longer pending. */
    async refreshPending(id: string, v: PendingRefresh): Promise<WaitlistEntryRow | null> {
      const [row] = await db
        .update(waitlistEntries)
        .set({
          confirmTokenHash: v.confirmTokenHash,
          confirmExpiresAt: v.confirmExpiresAt,
          ...(v.fields ?? {}),
        })
        .where(and(eq(waitlistEntries.id, id), eq(waitlistEntries.status, 'pending')))
        .returning();
      return row ?? null;
    },

    /**
     * D218: one atomic statement; null means unknown, used or expired. The hash is kept on the
     * confirmed row so a reused link reads as `used` (implementation-notes).
     */
    async confirmByTokenHash(tokenHash: string, now: Date): Promise<WaitlistEntryRow | null> {
      const [row] = await db
        .update(waitlistEntries)
        .set({ status: 'confirmed', confirmedAt: now })
        .where(
          and(
            eq(waitlistEntries.confirmTokenHash, tokenHash),
            eq(waitlistEntries.status, 'pending'),
            gt(waitlistEntries.confirmExpiresAt, now),
          ),
        )
        .returning();
      return row ?? null;
    },

    /** Only used to classify why a confirm failed. */
    async findByTokenHash(tokenHash: string): Promise<WaitlistEntryRow | null> {
      const [row] = await db
        .select()
        .from(waitlistEntries)
        .where(eq(waitlistEntries.confirmTokenHash, tokenHash))
        .limit(1);
      return row ?? null;
    },

    /** `confirmed` → `invited`; null when the entry isn't confirmed. */
    async markInvited(r: {
      id: string;
      invitedBy: string;
      userId: string;
      now: Date;
    }): Promise<WaitlistEntryRow | null> {
      const [row] = await db
        .update(waitlistEntries)
        .set({ status: 'invited', invitedAt: r.now, invitedBy: r.invitedBy, userId: r.userId })
        .where(and(eq(waitlistEntries.id, r.id), eq(waitlistEntries.status, 'confirmed')))
        .returning();
      return row ?? null;
    },

    /** Any live status → `removed`; null when the entry is missing or already removed. */
    async remove(r: {
      id: string;
      removedBy: string;
      now: Date;
    }): Promise<WaitlistEntryRow | null> {
      const [row] = await db
        .update(waitlistEntries)
        .set({ status: 'removed', removedAt: r.now, removedBy: r.removedBy })
        .where(and(eq(waitlistEntries.id, r.id), live))
        .returning();
      return row ?? null;
    },

    /** D220: hard-deletes expired pending and old removed entries; their events stay. */
    async pruneExpired(r: {
      pendingBefore: Date;
      removedBefore: Date;
    }): Promise<{ pendingDeleted: number; removedDeleted: number }> {
      const pending = await db
        .delete(waitlistEntries)
        .where(
          and(
            eq(waitlistEntries.status, 'pending'),
            lt(waitlistEntries.confirmExpiresAt, r.pendingBefore),
          ),
        )
        .returning({ id: waitlistEntries.id });
      const removed = await db
        .delete(waitlistEntries)
        .where(
          and(
            eq(waitlistEntries.status, 'removed'),
            lt(waitlistEntries.removedAt, r.removedBefore),
          ),
        )
        .returning({ id: waitlistEntries.id });
      return { pendingDeleted: pending.length, removedDeleted: removed.length };
    },

    /** D240: call inside the same transaction as the change it records. */
    async insertEvent(v: NewWaitlistEvent): Promise<WaitlistEventRow> {
      const [row] = await db
        .insert(waitlistEvents)
        .values({
          entryId: v.entryId,
          action: v.action,
          actorId: v.actorId ?? null,
          source: v.source ?? null,
        })
        .returning();
      return row;
    },

    async listEvents(entryId: string): Promise<WaitlistEventRow[]> {
      return db
        .select()
        .from(waitlistEvents)
        .where(eq(waitlistEvents.entryId, entryId))
        .orderBy(waitlistEvents.createdAt);
    },
  };
}

export type WaitlistRepo = ReturnType<typeof createWaitlistRepo>;
