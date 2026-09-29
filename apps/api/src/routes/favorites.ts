import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi';
import { problemSchema } from '@pb/shared';
import type { AppEnv } from '../types';
import type { Services } from '../services';
import { getUser } from '../lib/current-user';
import { AUTH_SECURITY } from '../lib/openapi';

export function registerFavoritesRoutes(app: OpenAPIHono<AppEnv>, services: Services): void {
  const addFavoriteRoute = createRoute({
    method: 'post',
    path: '/items/{id}/favorite',
    tags: ['favorites'],
    request: {
      params: z.object({ id: z.string().min(1) }),
    },
    responses: {
      204: {
        description: 'Favorite added successfully',
      },
      401: {
        content: { 'application/problem+json': { schema: problemSchema } },
        description: 'Unauthorized',
      },
      404: {
        content: { 'application/problem+json': { schema: problemSchema } },
        description: 'Item not found',
      },
    },
    security: AUTH_SECURITY,
  });

  app.openapi(addFavoriteRoute, async (c) => {
    const user = getUser(c);
    const { id } = c.req.valid('param');
    await services.favorites.add(user, id);
    return c.body(null, 204);
  });

  const removeFavoriteRoute = createRoute({
    method: 'delete',
    path: '/items/{id}/favorite',
    tags: ['favorites'],
    request: {
      params: z.object({ id: z.string().min(1) }),
    },
    responses: {
      204: {
        description: 'Favorite removed successfully',
      },
      401: {
        content: { 'application/problem+json': { schema: problemSchema } },
        description: 'Unauthorized',
      },
      404: {
        content: { 'application/problem+json': { schema: problemSchema } },
        description: 'Item not found',
      },
    },
    security: AUTH_SECURITY,
  });

  app.openapi(removeFavoriteRoute, async (c) => {
    const user = getUser(c);
    const { id } = c.req.valid('param');
    await services.favorites.remove(user, id);
    return c.body(null, 204);
  });
}
