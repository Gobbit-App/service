import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi';
import { importRequestSchema, importResultSchema } from '@gobbit/shared';
import type { AppEnv } from '../types';
import type { Services } from '../services';
import { getUser } from '../lib/current-user';
import { AUTH_SECURITY, problems } from '../lib/openapi';

const idParams = z.object({ id: z.string().min(1) });

/** D190: bulk import of parsed notes as proposals (owners and maintainers). */
export function registerImportsRoutes(app: OpenAPIHono<AppEnv>, services: Services): void {
  const importRoute = createRoute({
    method: 'post',
    path: '/decks/{id}/imports',
    tags: ['review'],
    security: AUTH_SECURITY,
    request: {
      params: idParams,
      body: { content: { 'application/json': { schema: importRequestSchema } }, required: true },
    },
    responses: {
      ...problems('bad-request', 'unauthorized', 'forbidden', 'not-found', 'rate-limited'),
      200: {
        content: { 'application/json': { schema: importResultSchema } },
        description: 'Rows proposed for review; rows that could not be proposed are in `failed`',
      },
    },
  });

  app.openapi(importRoute, async (c) => {
    const { id } = c.req.valid('param');
    return c.json(await services.imports.importRows(getUser(c), id, c.req.valid('json')), 200);
  });
}
