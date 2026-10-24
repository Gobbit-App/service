import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi';
import { itemSchema, publishRequestSchema, reviewCountSchema, reviewListSchema } from '@pb/shared';
import type { AppEnv } from '../types';
import type { Services } from '../services';
import { getActor, getUser } from '../lib/current-user';
import { AUTH_SECURITY, problems } from '../lib/openapi';

const idParams = z.object({ id: z.string().min(1) });

/** D106/D107: the review queue for deck publishers (owners and maintainers). */
export function registerReviewRoutes(app: OpenAPIHono<AppEnv>, services: Services): void {
  const listRoute = createRoute({
    method: 'get',
    path: '/decks/{id}/review',
    tags: ['review'],
    security: AUTH_SECURITY,
    request: { params: idParams },
    responses: {
      ...problems('unauthorized', 'forbidden', 'not-found'),
      200: {
        content: { 'application/json': { schema: reviewListSchema } },
        description: 'Proposals awaiting review, newest first',
      },
    },
  });

  app.openapi(listRoute, async (c) => {
    const { id } = c.req.valid('param');
    return c.json(await services.review.list(getUser(c), id), 200);
  });

  const countRoute = createRoute({
    method: 'get',
    path: '/decks/{id}/review/count',
    tags: ['review'],
    security: AUTH_SECURITY,
    request: { params: idParams },
    responses: {
      ...problems('unauthorized', 'forbidden', 'not-found'),
      200: {
        content: { 'application/json': { schema: reviewCountSchema } },
        description: 'Number of proposals awaiting review',
      },
    },
  });

  app.openapi(countRoute, async (c) => {
    const { id } = c.req.valid('param');
    return c.json(await services.review.count(getUser(c), id), 200);
  });

  const publishRoute = createRoute({
    method: 'post',
    path: '/items/{id}/publish',
    tags: ['review'],
    security: AUTH_SECURITY,
    request: {
      params: idParams,
      body: {
        content: { 'application/json': { schema: publishRequestSchema } },
        required: false,
      },
    },
    responses: {
      ...problems('bad-request', 'unauthorized', 'forbidden', 'not-found', 'conflict'),
      ...problems('unprocessable'),
      200: {
        content: { 'application/json': { schema: itemSchema } },
        description: 'The published card (the updated target in `update` mode)',
      },
    },
  });

  app.openapi(publishRoute, async (c) => {
    const { id } = c.req.valid('param');
    // Without a JSON content type the validator yields `{}`: re-parse so `mode` gets its default.
    const body = publishRequestSchema.parse(c.req.valid('json'));
    return c.json(await services.review.publish(getActor(c), id, body), 200);
  });

  const discardRoute = createRoute({
    method: 'post',
    path: '/items/{id}/discard',
    tags: ['review'],
    security: AUTH_SECURITY,
    request: { params: idParams },
    responses: {
      ...problems('unauthorized', 'forbidden', 'not-found', 'conflict'),
      204: { description: 'Proposal discarded' },
    },
  });

  app.openapi(discardRoute, async (c) => {
    const { id } = c.req.valid('param');
    await services.review.discard(getActor(c), id);
    return c.body(null, 204);
  });
}
