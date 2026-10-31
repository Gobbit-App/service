import { OpenAPIHono } from '@hono/zod-openapi';
import { cors } from 'hono/cors';
import type pg from 'pg';
import type { Db } from '@gobbit/db';
import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from './types';
import type { Env } from './env';
import type { Mailer } from './mail/mailer';

import { buildServices } from './services';
import { requestId } from './middleware/request-id';
import { requestLog } from './middleware/request-log';
import { bodyLimits } from './middleware/body-limit';
import { csrf, csrfOrigins } from './middleware/csrf';
import { sessionAuth } from './middleware/session-auth';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { problemFromZodError, problemResponse } from './errors/http-errors';
import { SESSION_COOKIE } from './lib/cookies';
import { registerHealthRoutes } from './routes/health';
import { registerConfigRoutes } from './routes/config';
import { registerAuthRoutes } from './routes/auth';
import { registerMeRoutes } from './routes/me';
import { registerDecksRoutes } from './routes/decks';
import { registerMembersRoutes } from './routes/members';
import { registerCategoriesRoutes } from './routes/categories';
import { registerItemsRoutes } from './routes/items';
import { registerFavoritesRoutes } from './routes/favorites';
import { registerShareRoutes } from './routes/share';
import type { ShareWiring } from './share/wiring';
import type { SearchWiring } from './services/search-wiring';
import { registerSearchRoutes } from './routes/search';
import { registerMediaRoutes } from './routes/media';
import type { IngestWiring } from './services/ingest-wiring';
import { registerIngestRoutes } from './routes/ingest';
import type { MediaWiring } from './services/media-wiring';
import { registerIngestTokensRoutes } from './routes/ingest-tokens';
import { registerReviewRoutes } from './routes/review';
import { registerMySharesRoutes } from './routes/my-shares';
import { registerImportsRoutes } from './routes/imports';
import { registerEventsRoutes } from './routes/events';
import { registerWebhookRoutes } from './routes/webhooks';
import { registerPublicRoutes } from './routes/public';
import { rateLimitedHtml, registerPublicPagesRoutes } from './routes/public-pages';
import { publicRateLimit } from './middleware/public-rate-limit';
import { createAnonRateLimiter, type AnonRateLimiter } from './lib/anon-rate-limiter';
import { PUBLIC_READ_PER_HOUR, PUBLIC_SEARCH_PER_HOUR } from '@gobbit/shared';
import { registerWaitlistRoutes } from './routes/waitlist';
import { registerLandingRoutes } from './routes/landing';
import { LANDING_DECISION_LEVELS, type LandingDecisions } from './services/landing.events';
import { LANDING_JOINED_PATH, LANDING_PATH } from './public/public-url';
import { registerAdminWaitlistRoutes } from './routes/admin-waitlist';
import { rateLimitRefusal } from './middleware/rate-limit-refused';
import { decisionLogger } from './lib/decision-event';
import { rateLimited } from './errors/http-errors';
import type { Logger } from './lib/logger';

export interface AppDeps {
  db: Db;
  pool: pg.Pool;
  env: Env;
  mailer: Mailer;
  /** Injectable clock; integration tests advance it to expire sessions and links. */
  now?: () => Date;
  /** OG image store/renderer overrides for tests (D60). */
  share?: ShareWiring;
  /** Embedder/asker/embed-queue overrides for tests (Phase 4). */
  search?: SearchWiring;
  /** Ingest uploads/queue/enabled overrides for tests (Phase 5). */
  ingest?: IngestWiring;
  /** Link preview fetcher override for tests (Phase 6). */
  media?: MediaWiring;
  /** D175: anonymous read limiter; tests pass one with a low limit. */
  anonLimiter?: AnonRateLimiter;
  /** D182: anonymous search request limiter (its own bucket); tests pass one with a low limit. */
  anonSearchLimiter?: AnonRateLimiter;
  /** D219: waitlist join/confirm per-IP limiter (its own bucket); tests pass one with a low limit. */
  waitlistLimiter?: AnonRateLimiter;
  /** Parent logger for decision events (D239); integration tests capture it. */
  logger?: Logger;
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

  // D32: cors → csrf → bodyLimits (D101) → requestId → sessionAuth → routes (requestLog wraps them all, off in tests)
  if (env.NODE_ENV !== 'test') {
    app.use('*', requestLog());
  }
  if (env.CORS_ORIGINS.length > 0) {
    app.use('*', cors({ origin: env.CORS_ORIGINS, credentials: true }));
  }
  app.use('*', csrf(csrfOrigins(env.CORS_ORIGINS, env.API_URL)));
  app.use('*', bodyLimits());
  app.use('*', requestId());
  app.use(
    '*',
    sessionAuth({
      authenticate: services.auth.authenticate,
      cookie: { secure: env.COOKIE_SECURE, domain: env.COOKIE_DOMAIN },
    }),
  );

  // D175: anonymous reads (JSON and pages share one budget) are counted per IP in memory,
  // never in the database.
  const anonLimit = {
    limiter: deps.anonLimiter ?? createAnonRateLimiter({ limit: PUBLIC_READ_PER_HOUR }),
    ipHeader: env.CLIENT_IP_HEADER,
    now: deps.now ?? (() => new Date()),
  };
  app.use('/public/*', publicRateLimit(anonLimit));
  app.use('/p/*', publicRateLimit({ ...anonLimit, onLimited: rateLimitedHtml }));
  // D182: searches also count in their own, lower bucket (each may cost an embedding).
  const searchLimit = {
    ...anonLimit,
    limiter: deps.anonSearchLimiter ?? createAnonRateLimiter({ limit: PUBLIC_SEARCH_PER_HOUR }),
  };
  app.use('/public/:slug/search', publicRateLimit(searchLimit));
  app.use('/p/:slug/search', publicRateLimit({ ...searchLimit, onLimited: rateLimitedHtml }));
  // D219: waitlist joins and confirms share their own per-IP bucket; each refusal is recorded
  // (D240). 030's HTML form reuses `waitlistLimit` with its own page as the answer.
  const recordWaitlistRefusal = rateLimitRefusal({
    bucket: 'waitlist',
    logHash: services.logHash,
    ipHeader: env.CLIENT_IP_HEADER,
    decisions: deps.logger
      ? decisionLogger('rate-limit', {
          parent: deps.logger,
          levels: { 'rate_limit.refused': 'warn' },
        })
      : undefined,
  });
  const waitlistLimit = {
    ...anonLimit,
    limiter:
      deps.waitlistLimiter ?? createAnonRateLimiter({ limit: env.WAITLIST_JOIN_PER_IP_PER_HOUR }),
  };
  const waitlistJsonLimit = publicRateLimit({
    ...waitlistLimit,
    onLimited: (c, retryAfterSeconds) => {
      recordWaitlistRefusal(c, retryAfterSeconds);
      throw rateLimited(retryAfterSeconds);
    },
  });
  // Hono's `/waitlist/*` also matches `/waitlist`; one registration counts each request once.
  app.use('/waitlist/*', waitlistJsonLimit);
  // 030: landing GETs count in the anonymous read budget; its POST counts in the waitlist
  // bucket inside the route, so the 429 page can keep the typed values.
  const landingReadLimit = publicRateLimit({ ...anonLimit, onLimited: rateLimitedHtml });
  const landingReads: MiddlewareHandler<AppEnv> = (c, next) =>
    c.req.method === 'POST' ? next() : landingReadLimit(c, next);
  app.use(LANDING_PATH, landingReads);
  app.use(LANDING_JOINED_PATH, landingReads);

  registerHealthRoutes(app, { pool: deps.pool, commit: env.GIT_SHA });
  registerConfigRoutes(app, env);
  registerAuthRoutes(app, services, env);
  registerMeRoutes(app, services);
  registerDecksRoutes(app, services);
  registerMembersRoutes(app, services);
  registerCategoriesRoutes(app, services);
  registerItemsRoutes(app, services);
  registerFavoritesRoutes(app, services);
  registerShareRoutes(app, services);
  registerSearchRoutes(app, services);
  registerMediaRoutes(app, services);
  registerIngestRoutes(app, services);
  registerIngestTokensRoutes(app, services);
  registerReviewRoutes(app, services);
  registerMySharesRoutes(app, services);
  registerImportsRoutes(app, services);
  registerEventsRoutes(app, services);
  registerPublicRoutes(app, services, env);
  registerPublicPagesRoutes(app, services, env);
  registerWebhookRoutes(app, { env, services, inbound: deps.ingest?.emailInbound });
  registerWaitlistRoutes(app, services, env);
  registerLandingRoutes(app, services, {
    env,
    joinLimiter: waitlistLimit.limiter,
    now: waitlistLimit.now,
    recordIpRefusal: recordWaitlistRefusal,
    decisions: decisionLogger<LandingDecisions>('landing', {
      parent: deps.logger,
      levels: LANDING_DECISION_LEVELS,
    }),
  });
  registerAdminWaitlistRoutes(app, services);

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
