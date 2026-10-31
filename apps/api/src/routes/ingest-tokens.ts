import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi';
import {
  ingestTokenCreatedSchema,
  ingestTokenCreateSchema,
  ingestTokenListSchema,
} from '@gobbit/shared';
import type { AppEnv } from '../types';
import type { Services } from '../services';
import { getUser } from '../lib/current-user';
import { AUTH_SECURITY, problems } from '../lib/openapi';

/** D99: the signed-in user's ingest tokens (iOS Shortcut, email-in). */
export function registerIngestTokensRoutes(app: OpenAPIHono<AppEnv>, services: Services): void {
  const listRoute = createRoute({
    method: 'get',
    path: '/me/ingest-tokens',
    tags: ['ingest'],
    security: AUTH_SECURITY,
    responses: {
      200: {
        content: { 'application/json': { schema: ingestTokenListSchema } },
        description: 'Live ingest tokens (never the secret)',
      },
      ...problems('unauthorized'),
    },
  });

  app.openapi(listRoute, async (c) => {
    return c.json(await services.ingestTokens.list(getUser(c)), 200);
  });

  const createTokenRoute = createRoute({
    method: 'post',
    path: '/me/ingest-tokens',
    tags: ['ingest'],
    security: AUTH_SECURITY,
    request: {
      body: {
        required: true,
        content: { 'application/json': { schema: ingestTokenCreateSchema } },
      },
    },
    responses: {
      201: {
        content: { 'application/json': { schema: ingestTokenCreatedSchema } },
        description: 'Created; `token` is shown this once',
      },
      ...problems('bad-request', 'unauthorized', 'forbidden', 'not-found', 'conflict'),
    },
  });

  app.openapi(createTokenRoute, async (c) => {
    const created = await services.ingestTokens.create(getUser(c), c.req.valid('json'));
    return c.json(created, 201);
  });

  const revokeRoute = createRoute({
    method: 'delete',
    path: '/me/ingest-tokens/{id}',
    tags: ['ingest'],
    security: AUTH_SECURITY,
    request: { params: z.object({ id: z.string().min(1) }) },
    responses: {
      204: { description: 'Revoked' },
      ...problems('unauthorized', 'not-found'),
    },
  });

  app.openapi(revokeRoute, async (c) => {
    await services.ingestTokens.revoke(getUser(c), c.req.valid('param').id);
    return c.body(null, 204);
  });
}
