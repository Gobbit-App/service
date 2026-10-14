import { type MiddlewareHandler } from 'hono';
import { type AppEnv } from '../types';

/** Paths polled by healthchecks; logging them would drown everything else. */
const QUIET_PATHS = new Set(['/health']);

/**
 * One line per request: method, path (no query string, so search text never lands in logs),
 * status, duration and request id. Registered first so CSRF rejections are logged too.
 */
export function requestLog(
  log: (line: string) => void = console.log,
  now: () => number = () => performance.now(),
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (QUIET_PATHS.has(c.req.path)) return next();

    const start = now();
    await next();
    const ms = Math.round(now() - start);
    const id = c.get('requestId') ?? '-';
    log(`[api] ${c.req.method} ${c.req.path} ${c.res.status} ${ms}ms ${id}`);
  };
}
