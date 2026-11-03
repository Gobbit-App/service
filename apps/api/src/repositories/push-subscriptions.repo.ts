import { and, eq, sql } from 'drizzle-orm';
import { pushSubscriptions, type DbExecutor } from '@gobbit/db';

export interface StoredPushSubscription {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

const columns = {
  id: pushSubscriptions.id,
  userId: pushSubscriptions.userId,
  endpoint: pushSubscriptions.endpoint,
  p256dh: pushSubscriptions.p256dh,
  auth: pushSubscriptions.auth,
};

export function createPushSubscriptionsRepo(db: DbExecutor) {
  return {
    /**
     * D297: one row per endpoint. Registering an endpoint again refreshes its keys and moves it
     * to the caller (a shared device that changed hands). Returns whether it was new.
     */
    async upsert(v: {
      userId: string;
      endpoint: string;
      p256dh: string;
      auth: string;
      label: string | null;
    }): Promise<{ id: string; created: boolean }> {
      const [row] = await db
        .insert(pushSubscriptions)
        .values(v)
        .onConflictDoUpdate({
          target: pushSubscriptions.endpoint,
          set: { userId: v.userId, p256dh: v.p256dh, auth: v.auth, label: v.label },
        })
        .returning({ id: pushSubscriptions.id, created: sql<boolean>`(xmax = 0)` });
      return row!;
    },

    /** Removes the caller's subscription for `endpoint`; false when there was none. */
    async removeForUser(userId: string, endpoint: string): Promise<boolean> {
      const rows = await db
        .delete(pushSubscriptions)
        .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)))
        .returning({ id: pushSubscriptions.id });
      return rows.length > 0;
    },

    async listForUser(userId: string): Promise<StoredPushSubscription[]> {
      return db.select(columns).from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
    },

    async findById(id: string): Promise<StoredPushSubscription | null> {
      const [row] = await db
        .select(columns)
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.id, id))
        .limit(1);
      return row ?? null;
    },

    /** D296: the push service said the device is gone (404/410). */
    async deleteById(id: string): Promise<void> {
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, id));
    },

    async touch(id: string): Promise<void> {
      await db
        .update(pushSubscriptions)
        .set({ lastUsedAt: sql`now()` })
        .where(eq(pushSubscriptions.id, id));
    },
  };
}

export type PushSubscriptionsRepo = ReturnType<typeof createPushSubscriptionsRepo>;
