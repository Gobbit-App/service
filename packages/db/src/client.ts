import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

// 57P01 admin_shutdown: server terminated the backend (restart, DROP DATABASE ... WITH (FORCE)).
const ADMIN_SHUTDOWN = '57P01';

export function createPool(connectionString: string): pg.Pool {
  const pool = new pg.Pool({ connectionString });
  // Idle clients can be killed server-side; without a listener pg re-emits that as an
  // uncaught exception. The pool discards the broken client on its own.
  pool.on('error', (err: Error & { code?: string }) => {
    if (err.code !== ADMIN_SHUTDOWN) console.error('[db] idle client error', err);
  });
  return pool;
}

export function createDb(pool: pg.Pool) {
  return drizzle(pool, { schema, casing: 'snake_case' });
}

export type Db = ReturnType<typeof createDb>;
