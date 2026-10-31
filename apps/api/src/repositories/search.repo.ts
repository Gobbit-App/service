import { and, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import { itemColumns, items, type Db, type ItemRow } from '@gobbit/db';
import {
  HNSW_EF_SEARCH,
  SEARCH_ARM_TOP_N,
  TEXT_ARM_MIN_CHARS,
  VECTOR_MAX_DISTANCE,
  WORD_SIMILARITY_THRESHOLD,
  type MemberRole,
} from '@gobbit/shared';
import { canSeePrivate, itemHasVisibleCategory } from '../access/visibility';
import type { ArmRow } from '../lib/rrf';

/** Escapes LIKE metacharacters so user input matches literally (default escape char `\`). */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** pgvector text literal, cast to `vector` in SQL. */
export function toVectorLiteral(v: readonly number[]): string {
  return `[${v.join(',')}]`;
}

const EMPTY_ARM = sql`select null::uuid as id, null::bigint as rank, false as substring where false`;

interface HybridQuery {
  deckId: string;
  /** Null = anonymous: public categories only (D182). */
  role: MemberRole | null;
  /** Output of `search_normalize()`. */
  qNormalized: string;
  /** Query embedding, or null for the text-only path. */
  vector: number[] | null;
  /** Only vectors produced by this model are comparable (D74). */
  model: string;
}

export function createSearchRepo(db: Db) {
  /** D75: published, live, in the deck, and (below maintainer) in a visible category. */
  function baseWhere(deckId: string, role: MemberRole | null): SQL {
    const visibility = canSeePrivate(role) ? sql`true` : itemHasVisibleCategory(role);
    return sql`${items.deckId} = ${deckId}
      and ${items.status} = 'published'
      and ${items.deletedAt} is null
      and ${visibility}`;
  }

  function textArm(q: HybridQuery): SQL {
    if ([...q.qNormalized].length < TEXT_ARM_MIN_CHARS) return EMPTY_ARM;
    const pattern = `%${escapeLike(q.qNormalized)}%`;
    return sql`select id, row_number() over (order by sim desc, id desc) as rank, substring
      from (
        select ${items.id} as id,
          word_similarity(${q.qNormalized}, ${items.searchText}) as sim,
          strpos(${items.searchText}, ${q.qNormalized}) > 0 as substring
        from ${items}
        where ${baseWhere(q.deckId, q.role)}
          and (${items.searchText} ilike ${pattern} or ${q.qNormalized} <% ${items.searchText})
        order by sim desc, id desc
        limit ${SEARCH_ARM_TOP_N}
      ) t`;
  }

  function vectorArm(q: HybridQuery): SQL {
    if (!q.vector) return EMPTY_ARM;
    const v = sql`${toVectorLiteral(q.vector)}::vector`;
    // ORDER BY distance + LIMIT inside the subquery keeps the HNSW index usable; the distance
    // cut-off is applied outside it (D75).
    return sql`select id, row_number() over (order by dist, id desc) as rank, false as substring
      from (
        select ${items.id} as id, ${items.embedding} <=> ${v} as dist
        from ${items}
        where ${baseWhere(q.deckId, q.role)}
          and ${items.embeddingModel} = ${q.model}
        order by ${items.embedding} <=> ${v}
        limit ${SEARCH_ARM_TOP_N}
      ) t
      where dist <= ${VECTOR_MAX_DISTANCE}`;
  }

  return {
    /** Same normalization as `items.search_text` (D70), done in SQL so both sides agree. */
    async normalize(q: string): Promise<string> {
      const res = await db.execute<{ q: string | null }>(sql`select search_normalize(${q}) as q`);
      return res.rows[0]?.q ?? '';
    },

    /** Both arms in one round trip; fusion happens in `fuseRrf` (D75). */
    async hybrid(q: HybridQuery): Promise<ArmRow[]> {
      return await db.transaction(async (tx) => {
        await tx.execute(sql`select
          set_config('hnsw.ef_search', ${String(HNSW_EF_SEARCH)}, true),
          set_config('hnsw.iterative_scan', 'relaxed_order', true),
          set_config('pg_trgm.word_similarity_threshold', ${String(WORD_SIMILARITY_THRESHOLD)}, true)`);

        const res = await tx.execute<{
          id: string;
          created_at: Date | string;
          text_rank: string | number | null;
          substring: boolean | null;
          vector_rank: string | number | null;
        }>(sql`with text_arm as (${textArm(q)}), vector_arm as (${vectorArm(q)})
          select ${items.id} as id, ${items.createdAt} as created_at,
            t.rank as text_rank, coalesce(t.substring, false) as substring, v.rank as vector_rank
          from text_arm t
          full outer join vector_arm v on v.id = t.id
          inner join ${items} on ${items.id} = coalesce(t.id, v.id)`);

        return res.rows.map((r) => ({
          id: r.id,
          createdAt: new Date(r.created_at),
          textRank: r.text_rank === null ? null : Number(r.text_rank),
          substring: r.substring === true,
          vectorRank: r.vector_rank === null ? null : Number(r.vector_rank),
        }));
      });
    },

    /** Loads rows for fused ids, returned in the given order. */
    async loadInOrder(ids: string[]): Promise<ItemRow[]> {
      if (ids.length === 0) return [];
      const rows = await db
        .select(itemColumns)
        .from(items)
        .where(and(inArray(items.id, ids), isNull(items.deletedAt)));
      const byId = new Map(rows.map((r) => [r.id, r]));
      return ids.flatMap((id) => byId.get(id) ?? []);
    },
  };
}

export type SearchRepo = ReturnType<typeof createSearchRepo>;
