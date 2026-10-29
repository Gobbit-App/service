import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi';
import { shareListSchema, shareSummarySchema } from '@gobbit/shared';
import type { AppEnv } from '../types';
import type { Services } from '../services';
import { getUser } from '../lib/current-user';
import { AUTH_SECURITY, problems } from '../lib/openapi';

const idParams = z.object({ id: z.string().min(1) });

/**
 * D196/D197: the sharer's own shares and their status ("Your shares"). Session or bearer only;
 * `ing_` tokens are refused by `sessionAuth` on every route but `POST /ingest` (ADR-046).
 */
export function registerMySharesRoutes(app: OpenAPIHono<AppEnv>, services: Services): void {
  const listRoute = createRoute({
    method: 'get',
    path: '/decks/{id}/shares',
    tags: ['shares'],
    security: AUTH_SECURITY,
    request: { params: idParams },
    responses: {
      ...problems('unauthorized', 'forbidden', 'not-found'),
      200: {
        content: { 'application/json': { schema: shareListSchema } },
        description: "The caller's shares on the deck over the last 30 days, newest first",
      },
    },
  });

  app.openapi(listRoute, async (c) => {
    const { id } = c.req.valid('param');
    return c.json({ shares: await services.shares.list(getUser(c), id) }, 200);
  });

  const getRoute = createRoute({
    method: 'get',
    path: '/shares/{id}',
    tags: ['shares'],
    security: AUTH_SECURITY,
    request: { params: idParams },
    responses: {
      ...problems('unauthorized', 'not-found'),
      200: {
        content: { 'application/json': { schema: shareSummarySchema } },
        description: 'One of your shares',
      },
    },
  });

  app.openapi(getRoute, async (c) => {
    const { id } = c.req.valid('param');
    return c.json(await services.shares.get(getUser(c), id), 200);
  });

  const retryRoute = createRoute({
    method: 'post',
    path: '/shares/{id}/retry',
    tags: ['shares'],
    security: AUTH_SECURITY,
    request: { params: idParams },
    responses: {
      ...problems('unauthorized', 'forbidden', 'not-found', 'conflict', 'gone'),
      ...problems('unprocessable', 'rate-limited'),
      202: {
        content: { 'application/json': { schema: shareSummarySchema } },
        description: 'The failed share is queued again from its stored copy',
      },
    },
  });

  app.openapi(retryRoute, async (c) => {
    const { id } = c.req.valid('param');
    return c.json(await services.shares.retry(getUser(c), id), 202);
  });
}
