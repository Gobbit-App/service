import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import { meSchema } from '@pb/shared';
import type { AppEnv } from '../types';
import type { Services } from '../services';
import { getUser } from '../lib/current-user';
import { AUTH_SECURITY, problems } from '../lib/openapi';

export function registerMeRoutes(app: OpenAPIHono<AppEnv>, services: Services): void {
  const meRoute = createRoute({
    method: 'get',
    path: '/me',
    tags: ['auth'],
    security: AUTH_SECURITY,
    responses: {
      200: {
        content: { 'application/json': { schema: meSchema } },
        description: 'The signed-in user and every deck they have a role on',
      },
      ...problems('unauthorized'),
    },
  });

  app.openapi(meRoute, async (c) => {
    const user = getUser(c);
    const decks = await services.decks.list(user);
    return c.json(
      { user: { id: user.id, email: user.email, displayName: user.displayName }, decks },
      200,
    );
  });
}
