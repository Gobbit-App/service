import { beforeAll } from 'vitest';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type { AppEnv } from '../src/types';
import { createApp } from '../src/app';
import {
  createSampleWorld,
  fixtureId,
  OWNER_EMAIL,
  withTestDb,
  type SampleWorld,
  type TestDb,
} from '@pb/db/test';

export const TEST_TOKEN = 'x'.repeat(40);

export const FAMILY_ID = fixtureId('deck/family');

export function setupApiTest(): {
  readonly app: OpenAPIHono<AppEnv>;
  readonly t: TestDb;
  readonly world: SampleWorld;
  as(email?: string): Record<string, string>;
} {
  const t = withTestDb();
  let app: OpenAPIHono<AppEnv>;
  let world: SampleWorld;

  beforeAll(async () => {
    world = await createSampleWorld(t.db);
    app = createApp({
      db: t.db,
      pool: t.pool,
      env: {
        DEV_AUTH_ENABLED: true,
        DEV_API_TOKEN: TEST_TOKEN,
      },
    });
  });

  return {
    get app(): OpenAPIHono<AppEnv> {
      return app!;
    },
    get t(): TestDb {
      return t;
    },
    get world(): SampleWorld {
      return world!;
    },
    as(email: string = OWNER_EMAIL): Record<string, string> {
      return {
        Authorization: `Bearer ${TEST_TOKEN}`,
        'X-Dev-User': email,
        'Content-Type': 'application/json',
      };
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper for loosely-typed JSON bodies
export async function json(res: Response): Promise<any> {
  return res.json();
}

export { OWNER_EMAIL, OTHER_EMAIL, fixtureId } from '@pb/db/test';
