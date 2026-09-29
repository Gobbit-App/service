import type pg from 'pg';
import { OWNER_ACCOUNT_ID, OWNER_USER_ID, type OwnerSeedConfig } from './owner';

export interface SeedResult {
  accountId: string;
  userId: string;
  smokeSession: boolean;
}

/**
 * D49: upserts exactly one account and one user (the owner). Idempotent — rows are
 * only rewritten when a value differs, so `updated_at` is stable across re-runs.
 */
export async function runSeed(pool: pg.Pool, config: OwnerSeedConfig): Promise<SeedResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO accounts AS t (id, name)
       VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
       WHERE t.name IS DISTINCT FROM EXCLUDED.name`,
      [OWNER_ACCOUNT_ID, config.name],
    );

    await client.query(
      `INSERT INTO users AS t (id, account_id, email, display_name)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET
         email = EXCLUDED.email,
         display_name = EXCLUDED.display_name
       WHERE (t.email, t.display_name) IS DISTINCT FROM (EXCLUDED.email, EXCLUDED.display_name)`,
      [OWNER_USER_ID, OWNER_ACCOUNT_ID, config.email, config.name],
    );

    await client.query('COMMIT');
    return { accountId: OWNER_ACCOUNT_ID, userId: OWNER_USER_ID, smokeSession: false };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export {
  parseOwnerSeedEnv,
  seedId,
  OWNER_ACCOUNT_ID,
  OWNER_USER_ID,
  SMOKE_SESSION_ID,
  type OwnerSeedConfig,
} from './owner';
