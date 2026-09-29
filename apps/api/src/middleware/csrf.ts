import type { MiddlewareHandler } from 'hono';
import { csrf as honoCsrf } from 'hono/csrf';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from '../types';
import { csrfRejected } from '../errors/http-errors';

/** Allowed origins: `CORS_ORIGINS` plus the API's own origin (same-origin form posts). */
export function csrfOrigins(corsOrigins: string[], apiUrl: string): string[] {
  return [...new Set([...corsOrigins, new URL(apiUrl).origin])];
}

/**
 * D32: `hono/csrf` over the allowed origins, skipped when an `Authorization` header is
 * present (a bearer carries no ambient credential). Its bare 403 becomes a problem+json.
 */
export function csrf(origins: string[]): MiddlewareHandler<AppEnv> {
  const inner = honoCsrf({ origin: origins });

  return async (c, next) => {
    if (c.req.header('Authorization') !== undefined) {
      return next();
    }

    let passed = false;
    try {
      await inner(c, async () => {
        passed = true;
      });
    } catch (err) {
      if (err instanceof HTTPException && err.status === 403) {
        throw csrfRejected();
      }
      throw err;
    }

    if (passed) {
      return next();
    }
    throw csrfRejected();
  };
}
