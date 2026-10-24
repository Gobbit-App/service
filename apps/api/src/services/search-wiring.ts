import type { Db } from '@pb/db';
import type { Env } from '../env';
import type { Asker } from '../ai/asker';
import type { Embedder } from '../ai/embedder';
import { defaultAsker, defaultEmbedder } from '../ai/providers';
import { createQueryEmbedder } from '../ai/query-embedder';
import { noopEmbedQueue, type EmbedQueue } from '../jobs/embed-queue';
import { createLlmCallsRepo } from '../repositories/llm-calls.repo';
import { createSearchQueriesRepo } from '../repositories/search-queries.repo';
import { createSearchRepo } from '../repositories/search.repo';
import type { DecksRepo } from '../repositories/decks.repo';
import type { MembershipLookup } from '../access/authorize';
import { createAskService } from './ask.service';
import type { ItemDtoMapper } from './item-dtos';
import type { PublicDeckService } from './public-deck.service';
import { createQueryBudget, type QueryBudgetLimits } from './query-budget';
import type { RateLimitService } from './rate-limit.service';
import { createSearchService } from './search.service';

/** Provider overrides for tests; `undefined` → built from env keys, `null` → feature off (D73). */
export interface SearchWiring {
  embedder?: Embedder | null;
  asker?: Asker | null;
  embedQueue?: EmbedQueue;
  /** Ask deadline override (tests); defaults to ASK_TIMEOUT_MS. */
  askTimeoutMs?: number;
  /** Query-embedding budgets (tests lower them); defaults to the shared constants (D182). */
  queryBudgetLimits?: QueryBudgetLimits;
}

/** The embedder from the wiring override, else from env keys (null → no embeddings). */
export function resolveEmbedder(env: Env, wiring: SearchWiring | undefined): Embedder | null {
  return wiring?.embedder === undefined ? defaultEmbedder(env) : wiring.embedder;
}

export function resolveEmbedQueue(wiring: SearchWiring | undefined): EmbedQueue {
  return wiring?.embedQueue ?? noopEmbedQueue;
}

export function buildSearchServices(deps: {
  db: Db;
  env: Env;
  decks: DecksRepo;
  memberships: MembershipLookup;
  publicDecks: Pick<PublicDeckService, 'resolvePublicDeck' | 'toPublicItems'>;
  rateLimits: RateLimitService;
  toDtos: ItemDtoMapper;
  wiring?: SearchWiring;
}) {
  const { db, env, decks, memberships, publicDecks, rateLimits, toDtos, wiring } = deps;
  const embedder = resolveEmbedder(env, wiring);
  const asker = wiring?.asker === undefined ? defaultAsker(env) : wiring.asker;
  const llmCalls = createLlmCallsRepo(db);

  const queryEmbedder = embedder
    ? createQueryEmbedder({
        embedder,
        llmCalls,
        withinBudget: createQueryBudget(rateLimits, wiring?.queryBudgetLimits),
      })
    : null;

  const search = createSearchService({
    decks,
    publicDecks,
    memberships,
    search: createSearchRepo(db),
    searchQueries: createSearchQueriesRepo(db),
    queryEmbedder,
    embeddingModel: embedder?.model ?? env.EMBEDDING_MODEL,
    toDtos,
  });

  return {
    search,
    ask: createAskService({
      asker,
      search,
      rateLimits,
      llmCalls,
      timeoutMs: wiring?.askTimeoutMs,
    }),
  };
}
