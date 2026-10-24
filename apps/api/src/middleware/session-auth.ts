import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import type { AppEnv, Authenticated } from '../types';
import { clearSessionCookie, SESSION_COOKIE } from '../lib/cookies';
import { sessionInvalid } from '../errors/http-errors';
import { isIngestToken } from '../ingest/ingest-token';
import { nonSessionPrefixOf } from '../lib/token-prefixes';

/**
 * Paths where a stale cookie is ignored instead of rejected, so a browser holding a dead
 * session can still sign in again (and health/doc probes never fail on cookies).
 */
export const LENIENT_PATHS = [
  '/health',
  '/openapi.json',
  '/config',
  '/auth/magic-link',
  '/auth/callback',
];

/** Path prefixes that are public (share previews, D174 public reads) and so are lenient as well. */
export const LENIENT_PREFIXES = ['/s/', '/public/'];

/** D174: the anonymous JSON surface never looks at credentials, so any cookie or bearer is ignored. */
export const CREDENTIAL_FREE_PREFIXES = ['/public/'];

/** True when a stale cookie must not block this path. */
export function isLenientPath(path: string): boolean {
  return LENIENT_PATHS.includes(path) || LENIENT_PREFIXES.some((p) => path.startsWith(p));
}

const BEARER_RE = /^Bearer\s+(.+)$/i;

/** D99: the only route an ingest token may call. */
export function isIngestTokenRoute(method: string, path: string): boolean {
  return method === 'POST' && path === '/ingest';
}

export interface SessionAuthOptions {
  authenticate(credentials: { bearer?: string; cookie?: string }): Promise<Authenticated | null>;
  cookie: { secure: boolean; domain?: string };
}

/**
 * D29: resolves the caller from `Authorization: Bearer` (wins) or the session cookie.
 * No credential → anonymous (routes that need a user call `getUser`, which 401s).
 * A bad bearer, or a non-session token (prefix registry) off its route → 401; a bad cookie → 401 that also clears the cookie, except on LENIENT_PATHS.
 */
export function sessionAuth(opts: SessionAuthOptions): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (CREDENTIAL_FREE_PREFIXES.some((p) => c.req.path.startsWith(p))) {
      return next();
    }
    const header = c.req.header('Authorization');
    const cookie = getCookie(c, SESSION_COOKIE);

    if (header !== undefined) {
      const bearer = BEARER_RE.exec(header)?.[1]?.trim();
      if (bearer && isIngestToken(bearer)) {
        // D99: ingest tokens authenticate POST /ingest only; everywhere else they're invalid.
        if (!isIngestTokenRoute(c.req.method, c.req.path)) {
          throw sessionInvalid();
        }
        c.set('ingestBearer', bearer);
        return next();
      }
      // ADR-046: a non-session token (any registered prefix) is never looked up as a session.
      if (bearer && nonSessionPrefixOf(bearer)) {
        throw sessionInvalid();
      }
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
      if (isLenientPath(c.req.path)) {
        return next();
      }
      throw sessionInvalid({ 'Set-Cookie': clearSessionCookie(opts.cookie) });
    }

    c.set('user', auth.user);
    c.set('auth', auth);
    return next();
  };
}
