import {
  PUBLIC_QUERY_EMBED_GLOBAL_PER_HOUR,
  PUBLIC_QUERY_EMBED_PER_HOUR,
  QUERY_EMBEDDING_BUDGET_PER_HOUR,
} from '@pb/shared';
import type { QueryBudgetKey } from '../ai/query-embedder';
import { rateKeys } from '../lib/rate-window';
import type { RateLimitService } from './rate-limit.service';

/** Hourly query-embedding budgets; tests lower them. */
export interface QueryBudgetLimits {
  perUser: number;
  /** D182: per anonymous IP. */
  anonPerIp: number;
  /** D182: all anonymous searches together. */
  anonGlobal: number;
}

export const DEFAULT_QUERY_BUDGET_LIMITS: QueryBudgetLimits = {
  perUser: QUERY_EMBEDDING_BUDGET_PER_HOUR,
  anonPerIp: PUBLIC_QUERY_EMBED_PER_HOUR,
  anonGlobal: PUBLIC_QUERY_EMBED_GLOBAL_PER_HOUR,
};

/**
 * D76, D182: DB-backed budgets for new query embeddings (they guard a paid call, so they survive
 * restarts). Members spend their own budget; a stranger needs room in both their IP's budget and
 * the global anonymous one. The global unit is only spent once the IP check passes.
 */
export function createQueryBudget(
  rateLimits: Pick<RateLimitService, 'check'>,
  limits: QueryBudgetLimits = DEFAULT_QUERY_BUDGET_LIMITS,
): (key: QueryBudgetKey) => Promise<boolean> {
  return async (key) => {
    if (key.kind === 'user') {
      return (await rateLimits.check(rateKeys.queryEmbedUser(key.userId), limits.perUser)).allowed;
    }
    const perIp = await rateLimits.check(rateKeys.queryEmbedAnon(key.ip), limits.anonPerIp);
    if (!perIp.allowed) return false;
    return (await rateLimits.check(rateKeys.queryEmbedAnonGlobal(), limits.anonGlobal)).allowed;
  };
}
