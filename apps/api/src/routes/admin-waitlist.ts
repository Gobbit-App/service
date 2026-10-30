import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi';
import type { Context } from 'hono';
import {
  adminWaitlistInviteResultSchema,
  adminWaitlistPageSchema,
  adminWaitlistQuerySchema,
} from '@pb/shared';
import type { AppEnv } from '../types';
import type { Services } from '../services';
import type { PlatformAdmin } from '../access/platform-admin';
import { AUTH_SECURITY, problems } from '../lib/openapi';

const idParam = z.object({ id: z.string().min(1) });

/** Set by the `/admin/*` guard; a route without it was registered outside the guard (a bug). */
function getAdmin(c: Context<AppEnv>): PlatformAdmin {
  const admin = c.get('platformAdmin');
  if (!admin) throw new Error('admin route reached without the platform-admin guard');
  return admin;
}

/**
 * 032: the platform admin's waitlist. The guard runs before validation, so a non-admin gets
 * the unknown-route 404 whatever the query (D234).
 */
export function registerAdminWaitlistRoutes(app: OpenAPIHono<AppEnv>, services: Services): void {
  app.use('/admin/*', async (c, next) => {
    c.set(
      'platformAdmin',
      services.platformAdmins.require(c.get('user'), {
        requestId: c.get('requestId'),
        method: c.req.method,
        path: c.req.path,
      }),
    );
    await next();
  });

  const listRoute = createRoute({
    method: 'get',
    path: '/admin/waitlist',
    tags: ['admin'],
    security: AUTH_SECURITY,
    request: { query: adminWaitlistQuerySchema },
    responses: {
      ...problems('bad-request', 'unauthorized', 'not-found'),
      200: {
        content: { 'application/json': { schema: adminWaitlistPageSchema } },
        description:
          'One page of one status (confirmed: longest waiting first) with counts per status',
      },
    },
  });

  const inviteRoute = createRoute({
    method: 'post',
    path: '/admin/waitlist/{id}/invite',
    tags: ['admin'],
    security: AUTH_SECURITY,
    request: { params: idParam },
    responses: {
      ...problems('unauthorized', 'not-found', 'conflict'),
      201: {
        content: { 'application/json': { schema: adminWaitlistInviteResultSchema } },
        description: 'Invited: the account exists and the sign-in link was mailed (see `mailSent`)',
      },
      200: {
        content: { 'application/json': { schema: adminWaitlistInviteResultSchema } },
        description: 'Already invited: a fresh sign-in link was mailed (see `mailSent`)',
      },
    },
  });

  const removeRoute = createRoute({
    method: 'delete',
    path: '/admin/waitlist/{id}',
    tags: ['admin'],
    security: AUTH_SECURITY,
    request: { params: idParam },
    responses: {
      ...problems('unauthorized', 'not-found', 'conflict'),
      204: { description: 'Removed (or already removed)' },
    },
  });

  app.openapi(listRoute, async (c) => {
    const page = await services.waitlistAdmin.list(getAdmin(c), c.req.valid('query'), {
      requestId: c.get('requestId'),
    });
    return c.json(page, 200);
  });

  app.openapi(inviteRoute, async (c) => {
    const { first, ...result } = await services.waitlistAdmin.invite(
      getAdmin(c),
      c.req.valid('param').id,
      { requestId: c.get('requestId') },
    );
    return first ? c.json(result, 201) : c.json(result, 200);
  });

  app.openapi(removeRoute, async (c) => {
    await services.waitlistAdmin.remove(getAdmin(c), c.req.valid('param').id, {
      requestId: c.get('requestId'),
    });
    return c.body(null, 204);
  });
}
