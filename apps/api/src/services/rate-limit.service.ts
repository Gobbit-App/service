import type { RateLimitsRepo } from '../repositories/rate-limits.repo';
import { rateLimited } from '../errors/http-errors';
import { isOverLimit, RATE_WINDOW_MS, retryAfterSeconds, windowStart } from '../lib/rate-window';

/** Probability that a hit also purges counters older than two windows (D39). */
export const PURGE_PROBABILITY = 0.01;

export interface RateCheck {
  allowed: boolean;
  retryAfterSeconds: number;
}

export function createRateLimitService(deps: {
  repo: RateLimitsRepo;
  now: () => Date;
  random?: () => number;
}) {
  const { repo, now, random = Math.random } = deps;

  async function check(key: string, limit: number): Promise<RateCheck> {
    const at = now();
    const count = await repo.hit(key, windowStart(at));

    if (random() < PURGE_PROBABILITY) {
      await repo.purgeBefore(new Date(at.getTime() - 2 * RATE_WINDOW_MS));
    }

    return { allowed: !isOverLimit(count, limit), retryAfterSeconds: retryAfterSeconds(at) };
  }

  return {
    check,

    /** Throws `429` with `Retry-After` once `key` exceeds `limit` in the current window. */
    async enforce(key: string, limit: number): Promise<void> {
      const result = await check(key, limit);
      if (!result.allowed) {
        throw rateLimited(result.retryAfterSeconds);
      }
    },
  };
}

export type RateLimitService = ReturnType<typeof createRateLimitService>;
