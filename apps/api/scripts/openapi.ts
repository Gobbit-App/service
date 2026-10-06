/**
 * D53: exports the OpenAPI document to `packages/api-client/openapi.json` without a database.
 * Route registration never queries, so stub db/pool handles are enough to build the app.
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import type { Db } from '@pb/db';
import { createApp } from '../src/app';
import { parseEnv } from '../src/env';
import { MemoryMailer } from '../src/mail/memory-mailer';

const OUTPUT = fileURLToPath(new URL('../../../packages/api-client/openapi.json', import.meta.url));

async function main(): Promise<void> {
  const env = parseEnv({ NODE_ENV: 'test', DATABASE_URL: 'postgres://stub@localhost:5432/stub' });
  const app = createApp({
    db: {} as unknown as Db,
    pool: {} as unknown as pg.Pool,
    env,
    mailer: new MemoryMailer(),
  });

  const res = await app.request('/openapi.json');
  if (!res.ok) throw new Error(`openapi.json responded ${res.status}`);

  const doc: unknown = await res.json();
  await writeFile(OUTPUT, `${JSON.stringify(doc, null, 2)}\n`);
  console.log(`wrote ${OUTPUT}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
