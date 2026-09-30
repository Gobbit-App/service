import { and, eq, gt, isNull } from 'drizzle-orm';
import type { SessionKind } from '@pb/shared';
import { sessions, users, type Db, type SessionRow } from '@pb/db';
import type { CurrentUser } from '../types';

export interface NewSession {
  userId: string;
  tokenHash: string;
  kind: SessionKind;
  expiresAt: Date;
  userAgent: string | null;
  now: Date;
}

export function createSessionsRepo(db: Db) {
  return {
    async create(v: NewSession): Promise<SessionRow> {
      const [row] = await db
        .insert(sessions)
        .values({
          userId: v.userId,
          tokenHash: v.tokenHash,
          kind: v.kind,
          expiresAt: v.expiresAt,
          userAgent: v.userAgent,
          lastSeenAt: v.now,
        })
        .returning();
      return row;
    },

    /** A live session (not revoked, not expired at `now`) whose user still exists. */
    async findActiveByTokenHash(
      tokenHash: string,
      now: Date,
    ): Promise<{ session: SessionRow; user: CurrentUser } | null> {
      const [row] = await db
        .select({
          session: sessions,
          user: {
            id: users.id,
            accountId: users.accountId,
            email: users.email,
            displayName: users.displayName,
          },
        })
        .from(sessions)
        .innerJoin(users, eq(users.id, sessions.userId))
        .where(
          and(
            eq(sessions.tokenHash, tokenHash),
            isNull(sessions.revokedAt),
            gt(sessions.expiresAt, now),
            isNull(users.deletedAt),
          ),
        )
        .limit(1);
      return row ?? null;
    },

    /** D27: one UPDATE slides both `last_seen_at` and `expires_at`. */
    async touch(id: string, now: Date, expiresAt: Date): Promise<void> {
      await db.update(sessions).set({ lastSeenAt: now, expiresAt }).where(eq(sessions.id, id));
    },

    async revoke(id: string, now: Date): Promise<void> {
      await db
        .update(sessions)
        .set({ revokedAt: now })
        .where(and(eq(sessions.id, id), isNull(sessions.revokedAt)));
    },

    async revokeAllForUser(userId: string, now: Date): Promise<void> {
      await db
        .update(sessions)
        .set({ revokedAt: now })
        .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
    },
  };
}

export type SessionsRepo = ReturnType<typeof createSessionsRepo>;
