import { PgBoss } from 'pg-boss';
import { childLogger, type Logger } from '../lib/logger';

/** pg-boss keeps its tables in its own schema; the app role owns the DB, so it can create it (D72). */
export const BOSS_SCHEMA = 'pgboss';

/**
 * D72: the API holds a send-only instance (no supervision, no cron); the worker process runs
 * maintenance, cron and the handlers. Both migrate the pg-boss schema on start.
 */
export type BossRole = 'sender' | 'worker';

/** pg-boss background failures as one JSON line each (connection errors keep their `code`). */
export function bossErrorHandler(role: BossRole, log: Logger = childLogger('pg-boss')) {
  return (err: unknown) => log.error({ err, role }, 'pg-boss error');
}

export function createBoss(databaseUrl: string, role: BossRole): PgBoss {
  const isWorker = role === 'worker';
  const boss = new PgBoss({
    connectionString: databaseUrl,
    schema: BOSS_SCHEMA,
    supervise: isWorker,
    schedule: isWorker,
    migrate: true,
    createSchema: true,
    max: isWorker ? 4 : 2,
  });
  // pg-boss emits `error` for background failures; an unhandled `error` event would crash.
  boss.on('error', bossErrorHandler(role));
  return boss;
}
