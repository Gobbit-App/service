import type { ItemRow } from '@gobbit/db';
import type {
  MemberRole,
  PublicSearchQuery,
  PublicSearchResponse,
  SearchLogMode,
  SearchResponse,
} from '@gobbit/shared';
import type { DecksRepo } from '../repositories/decks.repo';
import type { SearchRepo } from '../repositories/search.repo';
import type { SearchQueriesRepo } from '../repositories/search-queries.repo';
import type { QueryEmbedContext, QueryEmbedder } from '../ai/query-embedder';
import { authorize, type MembershipLookup } from '../access/authorize';
import { resolveDeck } from '../lib/resolve-deck';
import { fuseRrf, type FusedRow } from '../lib/rrf';
import type { CurrentUser } from '../types';
import type { ItemDtoMapper } from './item-dtos';
import type { PublicDeckRow, PublicDeckService } from './public-deck.service';
import { lineSink } from '../lib/logger';

type Hits = Array<FusedRow & { row: ItemRow }>;

export interface Retrieval {
  deckId: string;
  role: MemberRole;
  qNormalized: string;
  /** Fused rows joined to their item rows, best first. */
  hits: Hits;
  /** Whether the vector arm ran. */
  semantic: boolean;
}

export function createSearchService(deps: {
  decks: DecksRepo;
  /** D182: public deck rule and the `PublicItem` mapping for anonymous search. */
  publicDecks: Pick<PublicDeckService, 'resolvePublicDeck' | 'toPublicItems'>;
  memberships: MembershipLookup;
  search: SearchRepo;
  searchQueries: Pick<SearchQueriesRepo, 'insert'>;
  /** Null without an embedding key: text-only search (D73). */
  queryEmbedder: QueryEmbedder | null;
  /** The model whose stored item vectors are comparable; matches the worker's EMBEDDING_MODEL. */
  embeddingModel: string;
  toDtos: ItemDtoMapper;
  now?: () => number;
  log?: (message: string) => void;
}) {
  const {
    decks,
    publicDecks,
    memberships,
    search,
    searchQueries,
    queryEmbedder,
    embeddingModel,
    toDtos,
    now = Date.now,
    log = lineSink('search'),
  } = deps;

  /** D80: fire-and-forget; a logging failure must never fail the request. */
  function logQuery(row: Parameters<SearchQueriesRepo['insert']>[0]): void {
    searchQueries.insert(row).catch((err: unknown) => {
      log(`[search] query log failed: ${err instanceof Error ? err.message : String(err)}`);
    });
  }

  /**
   * D75/D76/D182: the one retrieval core for members and strangers, so ranking can't drift
   * between them. `role = null` sees public categories only. Logs the query.
   */
  async function runHybrid(opts: {
    deckId: string;
    role: MemberRole | null;
    q: string;
    limit: number;
    mode: SearchLogMode;
    embed: Omit<QueryEmbedContext, 'deckId'>;
  }): Promise<{ qNormalized: string; hits: Hits; semantic: boolean }> {
    const { deckId, role, limit, mode } = opts;
    const startedAt = now();
    const qNormalized = await search.normalize(opts.q);

    const vector =
      queryEmbedder && qNormalized.length > 0
        ? await queryEmbedder.embed(qNormalized, { ...opts.embed, deckId })
        : null;

    const arms =
      qNormalized.length > 0
        ? await search.hybrid({ deckId, role, qNormalized, vector, model: embeddingModel })
        : [];
    const fused = fuseRrf(arms, limit);
    const rows = await search.loadInOrder(fused.map((f) => f.id));
    const byId = new Map(rows.map((r) => [r.id, r]));
    const hits = fused.flatMap((f) => {
      const row = byId.get(f.id);
      return row ? [{ ...f, row }] : [];
    });

    logQuery({
      deckId,
      userId: opts.embed.userId,
      mode,
      qNormalized,
      resultCount: hits.length,
      topWhy: hits[0]?.why ?? null,
      latencyMs: Math.round(now() - startedAt),
    });

    return { qNormalized, hits, semantic: vector !== null };
  }

  /** D75/D76: hybrid retrieval shared by Search and Ask; logs the query. */
  async function retrieve(
    user: CurrentUser,
    idOrSlug: string,
    q: string,
    limit: number,
    mode: SearchLogMode,
  ): Promise<Retrieval> {
    const deck = await resolveDeck(decks, idOrSlug, user);
    const role = await authorize(user, deck, 'item.read', memberships);
    const r = await runHybrid({
      deckId: deck.id,
      role,
      q,
      limit,
      mode,
      embed: { budgetKey: { kind: 'user', userId: user.id }, userId: user.id },
    });
    return { deckId: deck.id, role, ...r };
  }

  /**
   * D182/D183: a stranger's search of a resolved public deck. Public cards only, `PublicItem`
   * results, logged as `public` with no user; the vector arm runs only within the anonymous
   * budgets charged to `ip`.
   */
  async function retrievePublic(
    deck: PublicDeckRow,
    q: string,
    limit: number,
    ip: string,
  ): Promise<PublicSearchResponse> {
    const r = await runHybrid({
      deckId: deck.id,
      role: null,
      q,
      limit,
      mode: 'public',
      embed: { budgetKey: { kind: 'anon', ip }, userId: null },
    });
    const dtos = await publicDecks.toPublicItems(
      deck.id,
      r.hits.map((h) => h.row),
    );
    return {
      data: r.hits.map((h, i) => ({ item: dtos[i]!, why: h.why, score: h.score })),
      semantic: r.semantic,
    };
  }

  return {
    retrieve,
    retrievePublic,

    /** D182: `GET /public/{slug}/search`; non-public decks answer 016's 404. */
    async searchPublic(
      slug: string,
      q: PublicSearchQuery,
      ip: string,
    ): Promise<PublicSearchResponse> {
      const deck = await publicDecks.resolvePublicDeck(slug);
      return await retrievePublic(deck, q.q, q.limit, ip);
    },

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
