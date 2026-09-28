import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { withTestDb } from './db-fixture';
import { health, accounts } from '../src';

describe('harness', () => {
  const t = withTestDb();

  it('pg_extension includes vector and pg_trgm', async () => {
    const result = await t.pool.query(
      'SELECT extname FROM pg_extension WHERE extname IN ($1, $2)',
      ['vector', 'pg_trgm'],
    );
    const extensions = result.rows.map((row) => row.extname);
    expect(extensions).toContain('vector');
    expect(extensions).toContain('pg_trgm');
  });

  it('health table has row id 1 with status ok', async () => {
    const result = await t.db.select().from(health).where(eq(health.id, 1));
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('ok');
  });

  it('isolation: marker-harness inserted, marker-isolation does not exist', async () => {
    // Each integration test gets its own database. This verifies that:
    // 1. We can write to our own DB (insert marker-harness)
    // 2. We see no data from other tests' DBs (marker-isolation from isolation.int.test.ts)
    await t.db.insert(accounts).values({ name: 'marker-harness' });

    const result = await t.db.select().from(accounts).where(eq(accounts.name, 'marker-isolation'));
    expect(result).toHaveLength(0);
  });
});
