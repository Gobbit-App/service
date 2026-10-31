import { and, asc, eq, isNull, sql, type SQL } from 'drizzle-orm';
import { items, type Db } from '@gobbit/db';

/** D74: the hash the stored vector must match; `item_embedding_hash()` lives in 0008_search. */
function expectedHash(model: string): SQL<string> {
  return sql<string>`item_embedding_hash(${model}, ${items.searchText})`;
}

/** Live (not deleted) item whose stored embedding is missing or was made from other text/model. */
function staleWhere(model: string): SQL {
  return sql`${items.embeddedHash} is distinct from ${expectedHash(model)}`;
}

export interface EmbeddingTarget {
  id: string;
  deckId: string;
  searchText: string;
  hash: string;
  stale: boolean;
}

export function createEmbeddingsRepo(db: Db) {
  return {
    async isStale(itemId: string, model: string): Promise<boolean> {
      const [row] = await db
        .select({ id: items.id })
        .from(items)
        .where(and(eq(items.id, itemId), isNull(items.deletedAt), staleWhere(model)))
        .limit(1);
      return row !== undefined;
    },

    async loadForEmbedding(itemId: string, model: string): Promise<EmbeddingTarget | null> {
      const [row] = await db
        .select({
          id: items.id,
          deckId: items.deckId,
          searchText: items.searchText,
          hash: expectedHash(model),
          stale: sql<boolean>`${staleWhere(model)}`,
        })
        .from(items)
        .where(and(eq(items.id, itemId), isNull(items.deletedAt)))
        .limit(1);
      return row ?? null;
    },

    /**
     * Stores the vector only if the card text still hashes to `hash`; an edit that landed while
     * the provider call was in flight makes this a no-op and its own job re-embeds (D74).
     */
    async saveEmbedding(
      itemId: string,
      v: { vector: number[]; model: string; hash: string },
    ): Promise<boolean> {
      const rows = await db
        .update(items)
        .set({
          embedding: v.vector,
          embeddingModel: v.model,
          embeddedHash: v.hash,
          embeddedAt: new Date(),
        })
        .where(and(eq(items.id, itemId), sql`${expectedHash(v.model)} = ${v.hash}`))
        .returning({ id: items.id });
      return rows.length > 0;
    },

    /** Oldest-first stale ids for the sweeper (D72). */
    async findStaleIds(model: string, limit: number): Promise<string[]> {
      const rows = await db
        .select({ id: items.id })
        .from(items)
        .where(and(isNull(items.deletedAt), staleWhere(model)))
        .orderBy(asc(items.updatedAt), asc(items.id))
        .limit(limit);
      return rows.map((r) => r.id);
    },
  };
}

export type EmbeddingsRepo = ReturnType<typeof createEmbeddingsRepo>;
