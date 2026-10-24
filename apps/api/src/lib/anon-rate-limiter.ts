import { LRUCache } from 'lru-cache';
import { RATE_WINDOW_MS, retryAfterSeconds, windowStart } from './rate-window';

export const ANON_LIMITER_MAX_KEYS = 10_000;

export interface AnonLimitResult {
  allowed: boolean;
  /** Seconds until the current window ends (only meaningful when not allowed). */
  retryAfterSeconds: number;
}

export interface AnonRateLimiter {
  /** Counts one request for `key` (an IP, or `bucket:ip`) and says whether it is within the limit. */
  hit(key: string, now: Date): AnonLimitResult;
}

interface WindowCount {
  start: number;
  count: number;
}

/**
 * D175: an in-process fixed one-hour window per key, so anonymous reads never write to the
 * database. The LRU bounds memory; an evicted key simply starts a fresh window.
 */
export function createAnonRateLimiter({
  limit,
  max = ANON_LIMITER_MAX_KEYS,
  windowMs = RATE_WINDOW_MS,
}: {
  limit: number;
  max?: number;
  windowMs?: number;
}): AnonRateLimiter {
  const windows = new LRUCache<string, WindowCount>({ max, ttl: windowMs });

  return {
    hit(key, now) {
      const start = windowStart(now, windowMs).getTime();
      const current = windows.get(key);
      const count = current && current.start === start ? current.count + 1 : 1;
      windows.set(key, { start, count });
      return { allowed: count <= limit, retryAfterSeconds: retryAfterSeconds(now, windowMs) };
    },
  };
}
