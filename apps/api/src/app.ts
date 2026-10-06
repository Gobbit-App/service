import { OpenAPIHono } from '@hono/zod-openapi';
import { cors } from 'hono/cors';
import type pg from 'pg';
import type { Db } from '@pb/db';
import type { AppEnv } from './types';
import type { Env } from './env';
import type { Mailer } from './mail/mailer';

import { buildServices } from './services';
import { requestId } from './middleware/request-id';
import { csrf, csrfOrigins } from './middleware/csrf';
import { sessionAuth } from './middleware/session-auth';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { problemFromZodError, problemResponse } from './errors/http-errors';
import { SESSION_COOKIE } from './lib/cookies';
import { registerHealthRoutes } from './routes/health';
import { registerAuthRoutes } from './routes/auth';
import { registerMeRoutes } from './routes/me';
import { registerDecksRoutes } from './routes/decks';
import { registerMembersRoutes } from './routes/members';
import { registerCategoriesRoutes } from './routes/categories';
import { registerItemsRoutes } from './routes/items';
import { registerFavoritesRoutes } from './routes/favorites';

export interface AppDeps {
  db: Db;
  pool: pg.Pool;
  env: Env;
  mailer: Mailer;
  /** Injectable clock; integration tests advance it to expire sessions and links. */
  now?: () => Date;
}

export function createApp(deps: AppDeps): OpenAPIHono<AppEnv> {
  const { env } = deps;
  const services = buildServices(deps);

  const app = new OpenAPIHono<AppEnv>({
    defaultHook: (result, c) => {
      if (!result.success) {
        return problemResponse(c, problemFromZodError(result.error));
      }
    },
  });

  // D32: cors → csrf → requestId → sessionAuth → routes
  if (env.CORS_ORIGINS.length > 0) {
    app.use('*', cors({ origin: env.CORS_ORIGINS, credentials: true }));
  }
  app.use('*', csrf(csrfOrigins(env.CORS_ORIGINS, env.API_URL)));
  app.use('*', requestId());
  app.use(
    '*',
    sessionAuth({
      authenticate: services.auth.authenticate,
      cookie: { secure: env.COOKIE_SECURE, domain: env.COOKIE_DOMAIN },
    }),
  );

  registerHealthRoutes(app, { pool: deps.pool, commit: env.GIT_SHA });
  registerAuthRoutes(app, services, env);
  registerMeRoutes(app, services);
  registerDecksRoutes(app, services);
  registerMembersRoutes(app, services);
  registerCategoriesRoutes(app, services);
  registerItemsRoutes(app, services);
  registerFavoritesRoutes(app, services);

  app.openAPIRegistry.registerComponent('securitySchemes', 'SessionCookie', {
    type: 'apiKey',
    in: 'cookie',
    name: SESSION_COOKIE,
  });

  app.openAPIRegistry.registerComponent('securitySchemes', 'BearerToken', {
    type: 'http',
    scheme: 'bearer',
  });

  app.doc31('/openapi.json', {
    openapi: '3.1.0',
    info: {
      title: 'Gobbit API',
      version: '0.2.0',
    },
  });

  app.onError(errorHandler);
  app.notFound(notFoundHandler);

  return app;
}
