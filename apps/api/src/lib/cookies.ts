import { serialize } from 'hono/utils/cookie';

export const SESSION_COOKIE = 'gobbit_session';

export interface CookieOptions {
  secure: boolean;
  domain?: string;
  maxAgeSeconds: number;
}

/** Set-Cookie header value for session cookie. */
export function sessionCookie(token: string, opts: CookieOptions): string {
  return serialize(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    secure: opts.secure,
    domain: opts.domain || undefined,
    maxAge: Math.floor(opts.maxAgeSeconds),
  });
}

/** Set-Cookie header value to clear session cookie. */
export function clearSessionCookie(opts: Omit<CookieOptions, 'maxAgeSeconds'>): string {
  return serialize(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    secure: opts.secure,
    domain: opts.domain || undefined,
    maxAge: 0,
  });
}
