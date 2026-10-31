import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import { appConfigSchema, type AppConfig } from '@gobbit/shared';
import type { AppEnv } from '../types';
import type { Env } from '../env';
import { cloudNameFrom } from '../lib/cloudinary-url';
import { analyticsHead } from '../public/analytics';
import {
  emailIngestDomain,
  hasAskProvider,
  hasEmbeddingProvider,
  hasExtractProvider,
} from '../ai/providers';

type ConfigEnv = Pick<
  Env,
  | 'CLOUDINARY_URL'
  | 'GIT_SHA'
  | 'OPENROUTER_API_KEY'
  | 'OPENAI_API_KEY'
  | 'ANTHROPIC_API_KEY'
  | 'INGEST_EMAIL_DOMAIN'
  | 'RESEND_WEBHOOK_SECRET'
  | 'RESEND_API_KEY'
  | 'SHORTCUT_URL'
  | 'ANALYTICS_SITE_ID'
> &
  // API_URL is always set at runtime (env.ts defaults it); optional so tests can pass a partial env.
  Partial<Pick<Env, 'API_URL' | 'APP_URL'>>;

/** Browsers and the web image may cache the config for five minutes (D55). */
export const CONFIG_CACHE_CONTROL = 'public, max-age=300';

/**
 * D55: the public config is derived from env once; only the cloud name leaves the server.
 * D245: the analytics site id is public already (031's landing tag).
 */
export function buildAppConfig(env: ConfigEnv): AppConfig {
  return appConfigSchema.parse({
    cloudinaryCloudName: cloudNameFrom(env.CLOUDINARY_URL),
    commit: env.GIT_SHA ?? 'dev',
    search: {
      semantic: hasEmbeddingProvider(env),
      ask: hasAskProvider(env),
    },
    ingest: {
      enabled: hasExtractProvider(env),
      emailDomain: hasExtractProvider(env) ? emailIngestDomain(env) : null,
      shortcutUrl: env.SHORTCUT_URL ?? null,
    },
    // D245: the SPA loads the tracker only when this is set.
    analytics: env.API_URL
      ? (analyticsHead({ ...env, API_URL: env.API_URL, APP_URL: env.APP_URL }) ?? null)
      : null,
  });
}

/** Registers `GET /config` (public, no auth). */
export function registerConfigRoutes(app: OpenAPIHono<AppEnv>, env: ConfigEnv): void {
  const config = buildAppConfig(env);

  const route = createRoute({
    method: 'get',
    path: '/config',
    tags: ['config'],
    responses: {
      200: {
        content: { 'application/json': { schema: appConfigSchema } },
        description: 'Public runtime configuration for the web app',
      },
    },
  });

  app.openapi(route, (c) => {
    c.header('Cache-Control', CONFIG_CACHE_CONTROL);
    return c.json(config, 200);
  });
}
