import type { ItemRow } from '@pb/db';
import type { MemberRole, SearchMode, SearchResponse } from '@pb/shared';
import type { DecksRepo } from '../repositories/decks.repo';
import type { SearchRepo } from '../repositories/search.repo';
import type { SearchQueriesRepo } from '../repositories/search-queries.repo';
import type { QueryEmbedder } from '../ai/query-embedder';
import { authorize, type MembershipLookup } from '../access/authorize';
import { resolveDeck } from '../lib/resolve-deck';
import { fuseRrf, type FusedRow } from '../lib/rrf';
import type { CurrentUser } from '../types';
import type { ItemDtoMapper } from './item-dtos';

export interface Retrieval {
  deckId: string;
  role: MemberRole;
  qNormalized: string;
  /** Fused rows joined to their item rows, best first. */
  hits: Array<FusedRow & { row: ItemRow }>;
  /** Whether the vector arm ran. */
  semantic: boolean;
}

export function createSearchService(deps: {
  decks: DecksRepo;
  memberships: MembershipLookup;
  search: SearchRepo;
  searchQueries: Pick<SearchQueriesRepo, 'insert'>;
  /** Null without `OPENAI_API_KEY`: text-only search (D73). */
  queryEmbedder: QueryEmbedder | null;
  /** The model whose stored item vectors are comparable; matches the worker's EMBEDDING_MODEL. */
  embeddingModel: string;
  toDtos: ItemDtoMapper;
  now?: () => number;
  log?: (message: string) => void;
}) {
  const {
    decks,
    memberships,
    search,
    searchQueries,
    queryEmbedder,
    embeddingModel,
    toDtos,
    now = Date.now,
    log = (m) => console.error(m),
  } = deps;

  /** D80: fire-and-forget; a logging failure must never fail the request. */
  function logQuery(row: Parameters<SearchQueriesRepo['insert']>[0]): void {
    searchQueries.insert(row).catch((err: unknown) => {
      log(`[search] query log failed: ${err instanceof Error ? err.message : String(err)}`);
    });
  }

  /** D75/D76: hybrid retrieval shared by Search and Ask; logs the query. */
  async function retrieve(
    user: CurrentUser,
    idOrSlug: string,
    q: string,
    limit: number,
    mode: SearchMode,
  ): Promise<Retrieval> {
    const startedAt = now();
    const deck = await resolveDeck(decks, idOrSlug, user);
    const role = await authorize(user, deck, 'item.read', memberships);
    const qNormalized = await search.normalize(q);

    const vector =
      queryEmbedder && qNormalized.length > 0
        ? await queryEmbedder.embed(qNormalized, { userId: user.id, deckId: deck.id })
        : null;

    const arms =
      qNormalized.length > 0
        ? await search.hybrid({ deckId: deck.id, role, qNormalized, vector, model: embeddingModel })
        : [];
    const fused = fuseRrf(arms, limit);
    const rows = await search.loadInOrder(fused.map((f) => f.id));
    const byId = new Map(rows.map((r) => [r.id, r]));
    const hits = fused.flatMap((f) => {
      const row = byId.get(f.id);
      return row ? [{ ...f, row }] : [];
    });

    logQuery({
      deckId: deck.id,
      userId: user.id,
      mode,
      qNormalized,
      resultCount: hits.length,
      topWhy: hits[0]?.why ?? null,
      latencyMs: Math.round(now() - startedAt),
    });

    return { deckId: deck.id, role, qNormalized, hits, semantic: vector !== null };
  }

  return {
    retrieve,

    async search(
      user: CurrentUser,
      idOrSlug: string,
      q: { q: string; limit: number },
    ): Promise<SearchResponse> {
      const r = await retrieve(user, idOrSlug, q.q, q.limit, 'search');
      const dtos = await toDtos(
        user,
        r.hits.map((h) => h.row),
        r.role,
      );
      return {
        data: r.hits.map((h, i) => ({ item: dtos[i], why: h.why, score: h.score })),
        semantic: r.semantic,
      };
    },
  };
}

export type SearchService = ReturnType<typeof createSearchService>;
