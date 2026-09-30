import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import type { AppEnv, Authenticated } from '../types';
import { clearSessionCookie, SESSION_COOKIE } from '../lib/cookies';
import { sessionInvalid } from '../errors/http-errors';

/**
 * Paths where a stale cookie is ignored instead of rejected, so a browser holding a dead
 * session can still sign in again (and health/doc probes never fail on cookies).
 */
export const LENIENT_PATHS = ['/health', '/openapi.json', '/auth/magic-link', '/auth/callback'];

const BEARER_RE = /^Bearer\s+(.+)$/i;

export interface SessionAuthOptions {
  authenticate(credentials: { bearer?: string; cookie?: string }): Promise<Authenticated | null>;
  cookie: { secure: boolean; domain?: string };
}

/**
 * D29: resolves the caller from `Authorization: Bearer` (wins) or the session cookie.
 * No credential → anonymous (routes that need a user call `getUser`, which 401s).
 * A bad bearer → 401; a bad cookie → 401 that also clears the cookie, except on LENIENT_PATHS.
 */
export function sessionAuth(opts: SessionAuthOptions): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const header = c.req.header('Authorization');
    const cookie = getCookie(c, SESSION_COOKIE);

    if (header !== undefined) {
      const bearer = BEARER_RE.exec(header)?.[1]?.trim();
      const auth = bearer ? await opts.authenticate({ bearer }) : null;
      if (!auth) {
        throw sessionInvalid();
      }
      c.set('user', auth.user);
      c.set('auth', auth);
      return next();
    }

    if (!cookie) {
      return next();
    }

    const auth = await opts.authenticate({ cookie });
    if (!auth) {
      if (LENIENT_PATHS.includes(c.req.path)) {
        return next();
      }
      throw sessionInvalid({ 'Set-Cookie': clearSessionCookie(opts.cookie) });
    }

    c.set('user', auth.user);
    c.set('auth', auth);
    return next();
  };
}
