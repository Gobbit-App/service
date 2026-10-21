import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

// 57P01 admin_shutdown: server terminated the backend (restart, DROP DATABASE ... WITH (FORCE)).
const ADMIN_SHUTDOWN = '57P01';

export type PoolErrorHandler = (err: Error & { code?: string }) => void;

/** Default for scripts: one JSON line on stderr, matching the API's log shape. */
const logIdleError: PoolErrorHandler = (err) => {
  console.error(
    JSON.stringify({
      level: 'error',
      time: new Date().toISOString(),
      component: 'db',
      msg: 'idle client error',
      err: { type: err.name, message: err.message, code: err.code ?? null, stack: err.stack },
    }),
  );
};

export function createPool(
  connectionString: string,
  options: { onIdleError?: PoolErrorHandler } = {},
): pg.Pool {
  const { onIdleError = logIdleError } = options;
  const pool = new pg.Pool({ connectionString });
  // Idle clients can be killed server-side; without a listener pg re-emits that as an
  // uncaught exception. The pool discards the broken client on its own.
  pool.on('error', (err: Error & { code?: string }) => {
    if (err.code !== ADMIN_SHUTDOWN) onIdleError(err);
  });
  return pool;
}

export function createDb(pool: pg.Pool) {
  return drizzle(pool, { schema, casing: 'snake_case' });
}

export type Db = ReturnType<typeof createDb>;

/** The callback parameter of `db.transaction` (Phase 3B: callback runs in one tx). */
export type DbTx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Anything a repository can run queries on: the root connection or a transaction. */
export type DbExecutor = Db | DbTx;
