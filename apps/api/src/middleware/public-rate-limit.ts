import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../types';
import type { AnonRateLimiter } from '../lib/anon-rate-limiter';
import { clientIp } from '../lib/client-ip';
import { rateLimited } from '../errors/http-errors';

/** D175: per-IP hourly ceiling on anonymous routes; members' `/decks` routes are not counted. */
export function publicRateLimit(opts: {
  limiter: AnonRateLimiter;
  ipHeader?: string;
  now: () => Date;
}): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const result = opts.limiter.hit(clientIp(c, opts.ipHeader), opts.now());
    if (!result.allowed) {
      throw rateLimited(result.retryAfterSeconds);
    }
    await next();
  };
}
