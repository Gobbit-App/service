import type pg from 'pg';
import { describe, expect, it } from 'vitest';
import type { Db } from '@gobbit/db';
import { createApp } from '../src/app';
import { parseEnv } from '../src/env';
import { MemoryMailer } from '../src/mail/memory-mailer';

/** 050 FR-002: nothing in the API can set or show the smart share switch. */
describe('OpenAPI document', () => {
  it('has no smartShare property anywhere', async () => {
    const app = createApp({
      db: {} as unknown as Db,
      pool: {} as unknown as pg.Pool,
      env: parseEnv({ NODE_ENV: 'test', DATABASE_URL: 'postgres://stub@localhost:5432/stub' }),
      mailer: new MemoryMailer(),
    });
    const res = await app.request('/openapi.json');
    expect(res.ok).toBe(true);
    // A property is a quoted key; the `no_smart_share` fallback value is not.
    expect(JSON.stringify(await res.json())).not.toMatch(/"smart_?share"\s*:/i);
  });
});
