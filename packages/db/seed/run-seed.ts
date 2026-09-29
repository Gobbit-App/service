import type pg from 'pg';
import { sha256Hex } from '../src/token-hash';
import { OWNER_ACCOUNT_ID, OWNER_USER_ID, SMOKE_SESSION_ID, type OwnerSeedConfig } from './owner';

/** D43: the smoke bearer session lives for a year and is re-armed when the token changes. */
const SMOKE_SESSION_TTL = '365 days';

export interface SeedResult {
  accountId: string;
  userId: string;
  smokeSession: boolean;
}

/**
 * D49: upserts exactly one account and one user (the owner), plus the smoke bearer
 * session when `SMOKE_SESSION_TOKEN` is set (D43). Idempotent — rows are
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

    if (config.smokeToken) {
      await client.query(
        `INSERT INTO sessions AS t (id, user_id, token_hash, kind, expires_at, user_agent)
         VALUES ($1, $2, $3, 'bearer', now() + $4::interval, 'smoke')
         ON CONFLICT (id) DO UPDATE SET
           token_hash = EXCLUDED.token_hash,
           expires_at = EXCLUDED.expires_at,
           revoked_at = NULL
         WHERE t.token_hash IS DISTINCT FROM EXCLUDED.token_hash
            OR t.revoked_at IS NOT NULL
            OR t.expires_at <= now()`,
        [SMOKE_SESSION_ID, OWNER_USER_ID, sha256Hex(config.smokeToken), SMOKE_SESSION_TTL],
      );
    }

    await client.query('COMMIT');
    return {
      accountId: OWNER_ACCOUNT_ID,
      userId: OWNER_USER_ID,
      smokeSession: Boolean(config.smokeToken),
    };
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
