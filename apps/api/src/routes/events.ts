import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi';
import { itemEventListQuerySchema, itemEventPageSchema } from '@gobbit/shared';
import type { AppEnv } from '../types';
import type { Services } from '../services';
import { getActor } from '../lib/current-user';
import { AUTH_SECURITY, problems } from '../lib/openapi';

/** D188: the deck's activity log (owners and maintainers). */
export function registerEventsRoutes(app: OpenAPIHono<AppEnv>, services: Services): void {
  const listRoute = createRoute({
    method: 'get',
    path: '/decks/{id}/events',
    tags: ['events'],
    security: AUTH_SECURITY,
    request: {
      params: z.object({ id: z.string().min(1) }),
      query: itemEventListQuerySchema,
    },
    responses: {
      ...problems('bad-request', 'unauthorized', 'forbidden', 'not-found'),
      200: {
        content: { 'application/json': { schema: itemEventPageSchema } },
        description: "The deck's card changes, newest first; `itemId` narrows to one card",
      },
    },
  });

  app.openapi(listRoute, async (c) => {
    const { id } = c.req.valid('param');
    return c.json(await services.events.list(getActor(c), id, c.req.valid('query')), 200);
  });
}
