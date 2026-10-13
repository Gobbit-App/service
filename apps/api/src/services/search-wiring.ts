import type { Db } from '@pb/db';
import { QUERY_EMBEDDING_BUDGET_PER_HOUR } from '@pb/shared';
import type { Env } from '../env';
import type { Asker } from '../ai/asker';
import type { Embedder } from '../ai/embedder';
import { createAnthropicAsker } from '../ai/anthropic-asker';
import { createOpenAiEmbedder } from '../ai/openai-embedder';
import { createQueryEmbedder } from '../ai/query-embedder';
import { noopEmbedQueue, type EmbedQueue } from '../jobs/embed-queue';
import { rateKeys } from '../lib/rate-window';
import { createLlmCallsRepo } from '../repositories/llm-calls.repo';
import { createSearchQueriesRepo } from '../repositories/search-queries.repo';
import { createSearchRepo } from '../repositories/search.repo';
import type { DecksRepo } from '../repositories/decks.repo';
import type { MembershipLookup } from '../access/authorize';
import { createAskService } from './ask.service';
import type { ItemDtoMapper } from './item-dtos';
import type { RateLimitService } from './rate-limit.service';
import { createSearchService } from './search.service';

/** Provider overrides for tests; `undefined` → built from env keys, `null` → feature off (D73). */
export interface SearchWiring {
  embedder?: Embedder | null;
  asker?: Asker | null;
  embedQueue?: EmbedQueue;
  /** Ask deadline override (tests); defaults to ASK_TIMEOUT_MS. */
  askTimeoutMs?: number;
}

export function defaultEmbedder(env: Env): Embedder | null {
  return env.OPENAI_API_KEY
    ? createOpenAiEmbedder({ apiKey: env.OPENAI_API_KEY, model: env.EMBEDDING_MODEL })
    : null;
}

function defaultAsker(env: Env): Asker | null {
  return env.ANTHROPIC_API_KEY
    ? createAnthropicAsker({ apiKey: env.ANTHROPIC_API_KEY, model: env.ASK_MODEL })
    : null;
}

export function resolveEmbedQueue(wiring: SearchWiring | undefined): EmbedQueue {
  return wiring?.embedQueue ?? noopEmbedQueue;
}

export function buildSearchServices(deps: {
  db: Db;
  env: Env;
  decks: DecksRepo;
  memberships: MembershipLookup;
  rateLimits: RateLimitService;
  toDtos: ItemDtoMapper;
  wiring?: SearchWiring;
}) {
  const { db, env, decks, memberships, rateLimits, toDtos, wiring } = deps;
  const embedder = wiring?.embedder === undefined ? defaultEmbedder(env) : wiring.embedder;
  const asker = wiring?.asker === undefined ? defaultAsker(env) : wiring.asker;
  const llmCalls = createLlmCallsRepo(db);

  const queryEmbedder = embedder
    ? createQueryEmbedder({
        embedder,
        llmCalls,
        withinBudget: async (userId) =>
          (await rateLimits.check(rateKeys.queryEmbedUser(userId), QUERY_EMBEDDING_BUDGET_PER_HOUR))
            .allowed,
      })
    : null;

  const search = createSearchService({
    decks,
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
