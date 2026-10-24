import { LRUCache } from 'lru-cache';
import { QUERY_EMBEDDING_CACHE_MAX, QUERY_EMBEDDING_CACHE_TTL_MS } from '@pb/shared';
import type { Embedder } from './embedder';
import { recordLlmCall, type LlmCallSink } from './llm-calls';
import { lineSink } from '../lib/logger';

/** D182: whose hourly budget a new query embedding is charged to. */
export type QueryBudgetKey = { kind: 'user'; userId: string } | { kind: 'anon'; ip: string };

export interface QueryEmbedContext {
  budgetKey: QueryBudgetKey;
  /** Recorded on the `llm_calls` row; null for anonymous searches (D183). */
  userId: string | null;
  deckId: string;
}

export interface QueryEmbedder {
  readonly model: string;
  /** Vector for an already-normalized query, or null when over budget or the provider fails (search degrades to text, D76). */
  embed(qNormalized: string, ctx: QueryEmbedContext): Promise<number[] | null>;
}

/** Cache key for a normalized query under a given model. */
export function queryCacheKey(model: string, qNormalized: string): string {
  return `${model}\u0000${qNormalized}`;
}

/** Budgeted, cached query embedder; never throws. */
export function createQueryEmbedder(deps: {
  embedder: Embedder;
  llmCalls: LlmCallSink;
  /** Resolves true while the key is under its hourly budget (consumes one unit per call). */
  withinBudget: (key: QueryBudgetKey) => Promise<boolean>;
  cacheMax?: number;
  ttlMs?: number;
  log?: (message: string) => void;
}): QueryEmbedder {
  const { embedder, llmCalls, withinBudget } = deps;
  const cache = new LRUCache<string, number[]>({
    max: deps.cacheMax ?? QUERY_EMBEDDING_CACHE_MAX,
    ttl: deps.ttlMs ?? QUERY_EMBEDDING_CACHE_TTL_MS,
  });
  const log = deps.log ?? lineSink('search', 'warn');

  return {
    model: embedder.model,
    async embed(qNormalized, ctx) {
      const key = queryCacheKey(embedder.model, qNormalized);
      const hit = cache.get(key);
      if (hit !== undefined) return hit;

      try {
        if (!(await withinBudget(ctx.budgetKey))) return null;
        const { vectors } = await recordLlmCall(
          llmCalls,
          {
            purpose: 'embed_query',
            provider: embedder.provider,
            model: embedder.model,
            deckId: ctx.deckId,
            userId: ctx.userId,
          },
          () => embedder.embed([qNormalized]),
        );
        const vector = vectors[0];
        if (vector === undefined) return null;
        cache.set(key, vector);
        return vector;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log(`query embedding failed: ${message}`);
        return null;
      }
    },
  };
}
