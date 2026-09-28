import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi';
import type { AppEnv } from '../types';
import type pg from 'pg';
import { getLatestMigrationTag } from '@pb/db';

export const healthResponseSchema = z.object({
  ok: z.boolean(),
  db_ms: z.number().nullable(),
  migration: z.string().nullable(),
});

export function registerHealthRoutes(app: OpenAPIHono<AppEnv>, deps: { pool: pg.Pool }): void {
  const route = createRoute({
    method: 'get',
    path: '/health',
    tags: ['health'],
    responses: {
      200: {
        content: {
          'application/json': {
            schema: healthResponseSchema,
          },
        },
        description: 'Health check passed',
      },
      503: {
        content: {
          'application/json': {
            schema: healthResponseSchema,
          },
        },
        description: 'Health check failed',
      },
    },
  });

  app.openapi(route, async (c) => {
    try {
      const start = performance.now();
      await deps.pool.query('select 1');
      const end = performance.now();
      const db_ms = Math.round((end - start) * 100) / 100;

      const migration = await getLatestMigrationTag(deps.pool);

      return c.json({ ok: true, db_ms, migration }, 200);
    } catch {
      return c.json({ ok: false, db_ms: null, migration: null }, 503);
    }
  });
}
