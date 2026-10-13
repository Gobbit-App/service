import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import { appConfigSchema, type AppConfig } from '@pb/shared';
import type { AppEnv } from '../types';
import type { Env } from '../env';
import { cloudNameFrom } from '../lib/cloudinary-url';

type ConfigEnv = Pick<Env, 'CLOUDINARY_URL' | 'GIT_SHA' | 'OPENAI_API_KEY' | 'ANTHROPIC_API_KEY'>;

/** Browsers and the web image may cache the config for five minutes (D55). */
export const CONFIG_CACHE_CONTROL = 'public, max-age=300';

/** D55: the public config is derived from env once; only the cloud name leaves the server. */
export function buildAppConfig(env: ConfigEnv): AppConfig {
  return appConfigSchema.parse({
    cloudinaryCloudName: cloudNameFrom(env.CLOUDINARY_URL),
    commit: env.GIT_SHA ?? 'dev',
    search: {
      semantic: Boolean(env.OPENAI_API_KEY),
      ask: Boolean(env.ANTHROPIC_API_KEY),
    },
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
