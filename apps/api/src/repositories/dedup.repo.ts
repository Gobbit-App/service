import { and, desc, eq, inArray, isNotNull, isNull, ne, sql, type SQL } from 'drizzle-orm';
import { items, type Db } from '@gobbit/db';
import { escapeLike, toVectorLiteral } from './search.repo';

/** How many same-host items are compared by normalized URL (family-scale decks). */
const SOURCE_URL_CANDIDATES = 200;

export interface DedupMatch {
  itemId: string;
  similarity: number;
}

/**
 * D103: lookups for the dedup verdict. Candidates are live published or proposed items in the
 * same deck, excluding the new proposal itself; category visibility is not applied because the
 * verdict is shown to publishers only.
 */
export function createDedupRepo(db: Db) {
  function candidatesWhere(deckId: string, excludeId: string): SQL {
    return and(
      eq(items.deckId, deckId),
      inArray(items.status, ['published', 'proposed']),
      isNull(items.deletedAt),
      ne(items.id, excludeId),
    )!;
  }

  return {
    /** Items in the deck whose `source_url` mentions `host` (normalized and compared by the caller). */
    async sourceUrlCandidates(
      deckId: string,
      excludeId: string,
      host: string,
    ): Promise<{ id: string; sourceUrl: string }[]> {
      const rows = await db
        .select({ id: items.id, sourceUrl: items.sourceUrl })
        .from(items)
        .where(
          and(
            candidatesWhere(deckId, excludeId),
            isNotNull(items.sourceUrl),
            sql`${items.sourceUrl} ilike ${`%${escapeLike(host)}%`}`,
          ),
        )
        // Published first, so an update targets the live card rather than another proposal.
        .orderBy(sql`${items.status} = 'published' desc`, desc(items.createdAt))
        .limit(SOURCE_URL_CANDIDATES);
      return rows.flatMap((r) => (r.sourceUrl ? [{ id: r.id, sourceUrl: r.sourceUrl }] : []));
    },

    /** Nearest item by cosine similarity among vectors made by `model` (D74). */
    async nearest(
      deckId: string,
      excludeId: string,
      vector: readonly number[],
      model: string,
    ): Promise<DedupMatch | null> {
      const v = sql`${toVectorLiteral(vector)}::vector`;
      const [row] = await db
        .select({ itemId: items.id, distance: sql<number>`${items.embedding} <=> ${v}` })
        .from(items)
        .where(and(candidatesWhere(deckId, excludeId), eq(items.embeddingModel, model)))
        .orderBy(sql`${items.embedding} <=> ${v}`)
        .limit(1);
      return row ? { itemId: row.itemId, similarity: 1 - Number(row.distance) } : null;
    },

    /** Keyless fallback: the most similar title (`word_similarity` over normalized titles). */
    async titleMatch(deckId: string, excludeId: string, title: string): Promise<DedupMatch | null> {
      const sim = sql<number>`word_similarity(search_normalize(${title}), search_normalize(${items.title}))`;
      const [row] = await db
        .select({ itemId: items.id, similarity: sim })
        .from(items)
        .where(candidatesWhere(deckId, excludeId))
        .orderBy(desc(sim), desc(items.createdAt))
        .limit(1);
      return row ? { itemId: row.itemId, similarity: Number(row.similarity) } : null;
    },
  };
}

export type DedupRepo = ReturnType<typeof createDedupRepo>;
