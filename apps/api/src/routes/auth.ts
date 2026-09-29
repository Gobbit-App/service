import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import {
  callbackQuerySchema,
  magicLinkRequestSchema,
  okSchema,
  tokenExchangeResponseSchema,
} from '@pb/shared';
import type { Context } from 'hono';
import type { AppEnv, Authenticated } from '../types';
import type { Env } from '../env';
import type { Services } from '../services';
import { MagicLinkFailure } from '../services/auth.service';
import { AUTH_SECURITY, problems } from '../lib/openapi';
import { clientIp } from '../lib/client-ip';
import { clearSessionCookie, sessionCookie } from '../lib/cookies';
import { callbackFailureLocation, callbackSuccessLocation } from '../lib/auth-redirect';
import { magicLinkInvalid, unauthorized } from '../errors/http-errors';

export type AuthRoutesEnv = Pick<
  Env,
  | 'API_URL'
  | 'APP_URL'
  | 'COOKIE_SECURE'
  | 'COOKIE_DOMAIN'
  | 'SESSION_TTL_DAYS'
  | 'CLIENT_IP_HEADER'
>;

function requireAuth(c: Context<AppEnv>): Authenticated {
  const auth = c.get('auth');
  if (!auth) {
    throw unauthorized('Authentication required');
  }
  return auth;
}

export function registerAuthRoutes(
  app: OpenAPIHono<AppEnv>,
  services: Services,
  env: AuthRoutesEnv,
): void {
  const cookieOpts = { secure: env.COOKIE_SECURE, domain: env.COOKIE_DOMAIN };
  const userAgent = (c: Context<AppEnv>) => c.req.header('User-Agent') ?? null;

  const magicLinkRoute = createRoute({
    method: 'post',
    path: '/auth/magic-link',
    tags: ['auth'],
    request: {
      body: { content: { 'application/json': { schema: magicLinkRequestSchema } }, required: true },
    },
    responses: {
      200: {
        content: { 'application/json': { schema: okSchema } },
        description: 'A sign-in link was sent if the address can receive one',
      },
      ...problems('validation', 'rate-limited'),
    },
  });

  app.openapi(magicLinkRoute, async (c) => {
    const { email } = c.req.valid('json');
    await services.auth.requestMagicLink({ email, ip: clientIp(c, env.CLIENT_IP_HEADER) });
    return c.json({ ok: true as const }, 200);
  });

  const callbackRoute = createRoute({
    method: 'get',
    path: '/auth/callback',
    tags: ['auth'],
    request: { query: callbackQuerySchema },
    responses: {
      303: { description: 'Signed in (Set-Cookie), or redirected to the web error page' },
      ...problems('validation', 'unauthorized', 'rate-limited'),
    },
  });

  app.openapi(callbackRoute, async (c) => {
    const { token } = c.req.valid('query');
    try {
      const result = await services.auth.consumeMagicLink({
        token,
        ip: clientIp(c, env.CLIENT_IP_HEADER),
        userAgent: userAgent(c),
      });
      c.header(
        'Set-Cookie',
        sessionCookie(result.token, {
          ...cookieOpts,
          maxAgeSeconds: env.SESSION_TTL_DAYS * 86_400,
        }),
      );
      return c.redirect(callbackSuccessLocation(env, result.next), 303);
    } catch (err) {
      if (!(err instanceof MagicLinkFailure)) {
        throw err;
      }
      const location = callbackFailureLocation(env, err.reason);
      if (!location) {
        throw magicLinkInvalid(err.reason);
      }
      return c.redirect(location, 303);
    }
  });

  const logoutRoute = createRoute({
    method: 'post',
    path: '/auth/logout',
    tags: ['auth'],
    security: AUTH_SECURITY,
    responses: {
      204: { description: 'The current session is revoked' },
      ...problems('unauthorized', 'forbidden'),
    },
  });

  app.openapi(logoutRoute, async (c) => {
    const auth = requireAuth(c);
    await services.auth.logout(auth.session);
    if (auth.via === 'cookie') {
      c.header('Set-Cookie', clearSessionCookie(cookieOpts));
    }
    return c.body(null, 204);
  });

  const logoutAllRoute = createRoute({
    method: 'post',
    path: '/auth/logout-all',
    tags: ['auth'],
    security: AUTH_SECURITY,
    responses: {
      204: { description: 'Every session of the user is revoked' },
      ...problems('unauthorized', 'forbidden'),
    },
  });

  app.openapi(logoutAllRoute, async (c) => {
    const auth = requireAuth(c);
    await services.auth.logoutAll(auth.user.id);
    if (auth.via === 'cookie') {
      c.header('Set-Cookie', clearSessionCookie(cookieOpts));
    }
    return c.body(null, 204);
  });

  const tokenExchangeRoute = createRoute({
    method: 'post',
    path: '/auth/token-exchange',
    tags: ['auth'],
    security: [{ SessionCookie: [] }],
    responses: {
      200: {
        content: { 'application/json': { schema: tokenExchangeResponseSchema } },
        description: 'A new bearer session; the token is shown once',
      },
      ...problems('unauthorized', 'forbidden'),
    },
  });

  app.openapi(tokenExchangeRoute, async (c) => {
    const auth = requireAuth(c);
    const { token, expiresAt } = await services.auth.exchangeForBearer(auth, userAgent(c));
    return c.json({ token, expiresAt: expiresAt.toISOString() }, 200);
  });
}
