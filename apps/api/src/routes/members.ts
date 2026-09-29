import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi';
import { inviteCreateSchema, inviteResponseSchema, memberListSchema } from '@pb/shared';
import type { AppEnv } from '../types';
import type { Services } from '../services';
import { getUser } from '../lib/current-user';
import { AUTH_SECURITY, problems } from '../lib/openapi';

const deckParams = z.object({ id: z.string().min(1) });

export function registerMembersRoutes(app: OpenAPIHono<AppEnv>, services: Services): void {
  const listRoute = createRoute({
    method: 'get',
    path: '/decks/{id}/members',
    tags: ['members'],
    security: AUTH_SECURITY,
    request: { params: deckParams },
    responses: {
      200: {
        content: { 'application/json': { schema: memberListSchema } },
        description: 'Implicit owners and every live membership (pending or accepted)',
      },
      ...problems('unauthorized', 'forbidden', 'not-found'),
    },
  });

  app.openapi(listRoute, async (c) => {
    const user = getUser(c);
    const { id } = c.req.valid('param');
    const data = await services.members.list(user, id);
    return c.json({ data }, 200);
  });

  const removeRoute = createRoute({
    method: 'delete',
    path: '/decks/{id}/members/{userId}',
    tags: ['members'],
    security: AUTH_SECURITY,
    request: { params: deckParams.extend({ userId: z.uuid() }) },
    responses: {
      204: { description: 'Membership removed (soft)' },
      ...problems('bad-request', 'unauthorized', 'forbidden', 'not-found'),
    },
  });

  app.openapi(removeRoute, async (c) => {
    const user = getUser(c);
    const { id, userId } = c.req.valid('param');
    await services.members.remove(user, id, userId);
    return c.body(null, 204);
  });

  const inviteRoute = createRoute({
    method: 'post',
    path: '/decks/{id}/invites',
    tags: ['members'],
    security: AUTH_SECURITY,
    request: {
      params: deckParams,
      body: { content: { 'application/json': { schema: inviteCreateSchema } }, required: true },
    },
    responses: {
      200: {
        content: { 'application/json': { schema: inviteResponseSchema } },
        description: 'Invite resent to a pending member',
      },
      201: {
        content: { 'application/json': { schema: inviteResponseSchema } },
        description: 'Pending membership created and invite sent',
      },
      ...problems(
        'bad-request',
        'validation',
        'unauthorized',
        'forbidden',
        'not-found',
        'conflict',
      ),
    },
  });

  app.openapi(inviteRoute, async (c) => {
    const user = getUser(c);
    const { id } = c.req.valid('param');
    const input = c.req.valid('json');
    const { membership, created } = await services.members.invite(user, id, input);
    return created ? c.json({ membership }, 201) : c.json({ membership }, 200);
  });
}
