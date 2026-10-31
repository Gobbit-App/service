import { and, count, desc, eq, isNull } from 'drizzle-orm';
import { ingestTokens, users, type DbExecutor, type IngestTokenRow } from '@gobbit/db';
import type { CurrentUser } from '../types';

export interface NewIngestTokenValues {
  userId: string;
  deckId: string | null;
  label: string;
  tokenHash: string;
  prefix: string;
}

/** D99: ingest-only tokens; a revoked token is kept (revoked_at) so its hash never matches again. */
export function createIngestTokensRepo(db: DbExecutor) {
  return {
    async create(v: NewIngestTokenValues): Promise<IngestTokenRow> {
      const [row] = await db.insert(ingestTokens).values(v).returning();
      return row;
    },

    async listLive(userId: string): Promise<IngestTokenRow[]> {
      return await db
        .select()
        .from(ingestTokens)
        .where(and(eq(ingestTokens.userId, userId), isNull(ingestTokens.revokedAt)))
        .orderBy(desc(ingestTokens.createdAt));
    },

    async countLive(userId: string): Promise<number> {
      const [row] = await db
        .select({ n: count() })
        .from(ingestTokens)
        .where(and(eq(ingestTokens.userId, userId), isNull(ingestTokens.revokedAt)));
      return row?.n ?? 0;
    },

    /** Revokes one of the user's live tokens; false when there was none. */
    async revoke(userId: string, id: string, now: Date): Promise<boolean> {
      const rows = await db
        .update(ingestTokens)
        .set({ revokedAt: now })
        .where(
          and(
            eq(ingestTokens.id, id),
            eq(ingestTokens.userId, userId),
            isNull(ingestTokens.revokedAt),
          ),
        )
        .returning({ id: ingestTokens.id });
      return rows.length > 0;
    },

    /** A live token whose user still exists. */
    async findLiveByHash(
      tokenHash: string,
    ): Promise<{ token: IngestTokenRow; user: CurrentUser } | null> {
      const [row] = await db
        .select({
          token: ingestTokens,
          user: {
            id: users.id,
            accountId: users.accountId,
            email: users.email,
            displayName: users.displayName,
          },
        })
        .from(ingestTokens)
        .innerJoin(users, eq(users.id, ingestTokens.userId))
        .where(
          and(
            eq(ingestTokens.tokenHash, tokenHash),
            isNull(ingestTokens.revokedAt),
            isNull(users.deletedAt),
          ),
        )
        .limit(1);
      return row ?? null;
    },

    async touch(id: string, now: Date): Promise<void> {
      await db.update(ingestTokens).set({ lastUsedAt: now }).where(eq(ingestTokens.id, id));
    },
  };
}

export type IngestTokensRepo = ReturnType<typeof createIngestTokensRepo>;
