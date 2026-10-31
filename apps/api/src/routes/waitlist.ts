import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import { waitlistJoinResponseSchema, waitlistJoinSchema } from '@gobbit/shared';
import type { AppEnv } from '../types';
import type { Env } from '../env';
import type { Services } from '../services';
import { problems } from '../lib/openapi';
import { clientIp } from '../lib/client-ip';

export type WaitlistRoutesEnv = Pick<Env, 'APP_URL' | 'CLIENT_IP_HEADER'>;

/** D218: where the confirm link lands; null without APP_URL (the route answers JSON instead). */
export function confirmLocation(appUrl: string | undefined, confirmed: boolean): string | null {
  if (!appUrl) return null;
  return `${appUrl}/welcome?${confirmed ? 'confirmed=1' : 'confirm=invalid'}`;
}

/**
 * D218: anonymous on purpose. Neither route reads `c.var.user`, so a signed-in caller is
 * treated as a stranger. Both sit behind the waitlist's per-IP limiter (app.ts, D219).
 */
export function registerWaitlistRoutes(
  app: OpenAPIHono<AppEnv>,
  services: Services,
  env: WaitlistRoutesEnv,
): void {
  const joinRoute = createRoute({
    method: 'post',
    path: '/waitlist',
    tags: ['waitlist'],
    request: {
      body: { content: { 'application/json': { schema: waitlistJoinSchema } }, required: true },
    },
    responses: {
      202: {
        content: { 'application/json': { schema: waitlistJoinResponseSchema } },
        description:
          'Accepted. The same answer whether the address is new, already listed or a user (no enumeration)',
      },
      ...problems('validation', 'rate-limited'),
    },
  });

  app.openapi(joinRoute, async (c) => {
    const body = c.req.valid('json');
    await services.waitlist.join({
      ...body,
      source: 'landing',
      ip: clientIp(c, env.CLIENT_IP_HEADER),
      requestId: c.get('requestId'),
    });
    return c.json({ ok: true as const }, 202);
  });

  // Outside OpenAPI like a mail link target: a browser opens it and follows the redirect.
  app.get('/waitlist/confirm', async (c) => {
    const result = await services.waitlist.confirm(c.req.query('token') || undefined, {
      requestId: c.get('requestId'),
    });
    c.header('Cache-Control', 'no-store');
    // The token is in this URL; the landing page must not see it in a Referer.
    c.header('Referrer-Policy', 'no-referrer');
    const location = confirmLocation(env.APP_URL, result.confirmed);
    return location ? c.redirect(location, 303) : c.json(result, 200);
  });
}
