import { OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';
import type { Db } from '@pb/db';
import type { AppEnv } from './types';
import type { Env } from './env';

import { buildServices } from './services';
import { requestId } from './middleware/request-id';
import { devAuth } from './middleware/dev-auth';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { problemFromZodError, problemResponse } from './errors/http-errors';
import { registerHealthRoutes } from './routes/health';
import { registerPocketbooksRoutes } from './routes/pocketbooks';
import { registerCategoriesRoutes } from './routes/categories';
import { registerItemsRoutes } from './routes/items';
import { registerFavoritesRoutes } from './routes/favorites';

export function createApp(deps: {
  db: Db;
  pool: pg.Pool;
  env: Pick<Env, 'DEV_AUTH_ENABLED' | 'DEV_API_TOKEN'>;
}): OpenAPIHono<AppEnv> {
  const services = buildServices(deps.db);

  const app = new OpenAPIHono<AppEnv>({
    defaultHook: (result, c) => {
      if (!result.success) {
        return problemResponse(c, problemFromZodError(result.error));
      }
    },
  });

  app.use('*', requestId());

  if (deps.env.DEV_AUTH_ENABLED) {
    app.use(
      '*',
      devAuth({
        token: deps.env.DEV_API_TOKEN ?? '',
        lookupUser: services.users.findByEmail,
      }),
    );
  }

  registerHealthRoutes(app, { pool: deps.pool });
  registerPocketbooksRoutes(app, services);
  registerCategoriesRoutes(app, services);
  registerItemsRoutes(app, services);
  registerFavoritesRoutes(app, services);

  app.openAPIRegistry.registerComponent('securitySchemes', 'DevToken', {
    type: 'http',
    scheme: 'bearer',
  });

  app.openAPIRegistry.registerComponent('securitySchemes', 'DevUser', {
    type: 'apiKey',
    in: 'header',
    name: 'X-Dev-User',
  });

  app.doc31('/openapi.json', {
    openapi: '3.1.0',
    info: {
      title: 'Community Pocketbook API',
      version: '0.1.0',
    },
  });

  app.onError(errorHandler);
  app.notFound(notFoundHandler);

  return app;
}
