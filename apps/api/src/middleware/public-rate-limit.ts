import type { Context, MiddlewareHandler } from 'hono';
import type { AppEnv } from '../types';
import type { AnonRateLimiter } from '../lib/anon-rate-limiter';
import { clientIp } from '../lib/client-ip';
import { rateLimited } from '../errors/http-errors';

/** D175: per-IP hourly ceiling on anonymous routes; members' `/decks` routes are not counted. */
export function publicRateLimit(opts: {
  limiter: AnonRateLimiter;
  ipHeader?: string;
  now: () => Date;
  /** D177: HTML routes answer their own 429 page; JSON routes get the problem response. */
  onLimited?: (c: Context<AppEnv>, retryAfterSeconds: number) => Response;
}): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const result = opts.limiter.hit(clientIp(c, opts.ipHeader), opts.now());
    if (!result.allowed) {
      if (opts.onLimited) return opts.onLimited(c, result.retryAfterSeconds);
      throw rateLimited(result.retryAfterSeconds);
    }
    await next();
  };
}
