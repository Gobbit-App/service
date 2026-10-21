import { type MiddlewareHandler } from 'hono';
import { childLogger, type Logger } from '../lib/logger';
import { type AppEnv } from '../types';

/** Paths polled by healthchecks; logging them would drown everything else. */
const QUIET_PATHS = new Set(['/health']);

/**
 * One JSON line per request: method, path (no query string, so search text never lands in logs),
 * status, duration and request id. 5xx log at error, 4xx at warn. Registered first so CSRF
 * rejections are logged too.
 */
export function requestLog(
  log: Logger = childLogger('http'),
  now: () => number = () => performance.now(),
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (QUIET_PATHS.has(c.req.path)) return next();

    const start = now();
    await next();
    const status = c.res.status;
    const fields = {
      requestId: c.get('requestId') ?? null,
      method: c.req.method,
      path: c.req.path,
      status,
      durationMs: Math.round(now() - start),
    };
    const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
    log[level](fields, 'request');
  };
}
