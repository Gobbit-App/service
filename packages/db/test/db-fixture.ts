import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, inject } from 'vitest';
import type { Pool } from 'pg';
import { createDb, createPool, type Db } from '../src/client';

export interface TestDb {
  url: string;
  pool: Pool;
  db: Db;
}

export function withTestDb(opts?: { template?: boolean }): TestDb {
  const t = {} as TestDb;
  let adminPool: Pool | undefined;
  let dbName: string;

  beforeAll(async () => {
    const adminUrl = inject('pgAdminUrl');
    const templateDb = inject('pgTemplateDb');
    dbName = `test_${randomBytes(6).toString('hex')}`;

    // Create admin pool for database creation
    adminPool = createPool(adminUrl);

    if (opts?.template === false) {
      // Create plain empty database
      await adminPool.query(`CREATE DATABASE "${dbName}"`);
    } else {
      // Create database from template
      await adminPool.query(`CREATE DATABASE "${dbName}" TEMPLATE ${templateDb}`);
    }

    // Build the test database URL
    const adminUrlObj = new URL(adminUrl);
    adminUrlObj.pathname = `/${dbName}`;
    t.url = adminUrlObj.toString();

    // Create pool and db for test
    t.pool = createPool(t.url);
    t.db = createDb(t.pool);
  });

  afterAll(async () => {
    if (t.pool) {
      await t.pool.end();
    }

    if (adminPool && dbName) {
      try {
        await adminPool.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
      } finally {
        await adminPool.end();
      }
    }
  });

  return t;
}

declare module 'vitest' {
  export interface ProvidedContext {
    pgAdminUrl: string;
    pgTemplateDb: string;
  }
}
