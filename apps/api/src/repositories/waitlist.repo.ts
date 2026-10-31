import { and, asc, count, desc, eq, gt, lt, ne, sql, type SQL } from 'drizzle-orm';
import type {
  CursorData,
  WaitlistEventAction,
  WaitlistKind,
  WaitlistSource,
  WaitlistStatus,
} from '@gobbit/shared';
import {
  users,
  waitlistEntries,
  waitlistEvents,
  type DbExecutor,
  type WaitlistEntryRow,
  type WaitlistEventRow,
} from '@gobbit/db';

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

export interface AdminListQuery {
  status: WaitlistStatus;
  kind?: WaitlistKind;
  /** `createdAt` carries the value of the status's sort column (`adminSortValue`). */
  cursor?: CursorData;
  limit: number;
}

export type AdminListRow = WaitlistEntryRow & { invitedByName: string | null };

/**
 * 032 contract: the confirmed queue is oldest-confirmed first (who has waited longest);
 * invited is newest invite first; pending and removed are newest join first. `id` breaks ties.
 */
const ADMIN_ORDER = {
  confirmed: { key: 'confirmedAt', ascending: true },
  invited: { key: 'invitedAt', ascending: false },
  pending: { key: 'createdAt', ascending: false },
  removed: { key: 'createdAt', ascending: false },
} as const satisfies Record<
  WaitlistStatus,
  { key: 'confirmedAt' | 'invitedAt' | 'createdAt'; ascending: boolean }
>;

/** The sort value a page's cursor carries for `row` (its status's order column). */
export function adminSortValue(row: WaitlistEntryRow): Date {
  return row[ADMIN_ORDER[row.status].key] ?? row.createdAt;
}

function adminOrder(q: AdminListQuery): { where?: SQL; orderBy: SQL[] } {
  const { key, ascending } = ADMIN_ORDER[q.status];
  const column = waitlistEntries[key];
  const by = ascending ? asc : desc;
  const orderBy = [by(column), by(waitlistEntries.id)];
  if (!q.cursor) return { orderBy };
  const after = sql`(${column}, ${waitlistEntries.id})`;
  const at = sql`(${q.cursor.createdAt}::timestamptz, ${q.cursor.id}::uuid)`;
  return { where: ascending ? sql`${after} > ${at}` : sql`${after} < ${at}`, orderBy };
}

/** D217: every status change goes through `waitlist.service`; this module is SQL only. */
export function createWaitlistRepo(db: DbExecutor) {
  const selectForAdmin = () =>
    db
      .select({ entry: waitlistEntries, invitedByName: users.displayName })
      .from(waitlistEntries)
      .leftJoin(users, eq(users.id, waitlistEntries.invitedBy))
      .$dynamic();

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

    /** 032: row lock for an admin action; a concurrent invite/remove waits for this one. */
    async lockById(id: string): Promise<WaitlistEntryRow | null> {
      const [row] = await db
        .select()
        .from(waitlistEntries)
        .where(eq(waitlistEntries.id, id))
        .limit(1)
        .for('update');
      return row ?? null;
    },

    /** 032: one entry with the inviter's display name (the admin DTO after an action). */
    async findForAdmin(id: string): Promise<AdminListRow | null> {
      const [row] = await selectForAdmin().where(eq(waitlistEntries.id, id)).limit(1);
      return row ? { ...row.entry, invitedByName: row.invitedByName } : null;
    },

    /** 032: one page of one status (keyset, `ADMIN_ORDER`), with the inviter's display name. */
    async listForAdmin(q: AdminListQuery): Promise<AdminListRow[]> {
      const { where, orderBy } = adminOrder(q);
      const rows = await selectForAdmin()
        .where(
          and(
            eq(waitlistEntries.status, q.status),
            q.kind ? eq(waitlistEntries.kind, q.kind) : undefined,
            where,
          ),
        )
        .orderBy(...orderBy)
        .limit(q.limit);
      return rows.map((r) => ({ ...r.entry, invitedByName: r.invitedByName }));
    },

    /** 032: entries per status (every status present, zeros included), optionally of one kind. */
    async countsByStatus(kind?: WaitlistKind): Promise<Record<WaitlistStatus, number>> {
      const rows = await db
        .select({ status: waitlistEntries.status, n: count() })
        .from(waitlistEntries)
        .where(kind ? eq(waitlistEntries.kind, kind) : undefined)
        .groupBy(waitlistEntries.status);
      const counts = { pending: 0, confirmed: 0, invited: 0, removed: 0 };
      for (const r of rows) counts[r.status] = r.n;
      return counts;
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
