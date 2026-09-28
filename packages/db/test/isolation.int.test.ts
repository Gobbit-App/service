import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { accounts } from '../src/schema';
import { withTestDb } from './db-fixture';

describe('DB isolation', () => {
  const testDb = withTestDb();

  it('each test file gets its own isolated database', async () => {
    const db = testDb.db;
    const pool = testDb.pool;

    // Insert a marker into our isolated database
    const inserted = await db.insert(accounts).values({ name: 'marker-isolation' }).returning();
    expect(inserted).toHaveLength(1);

    // Verify the marker was inserted
    const found = await db.select().from(accounts).where(eq(accounts.name, 'marker-isolation'));
    expect(found).toHaveLength(1);

    // Verify isolation: accounts from other tests don't exist in this database
    const otherMarker = await db.select().from(accounts).where(eq(accounts.name, 'marker-harness'));
    expect(otherMarker).toHaveLength(0);

    // Verify we're in a test database (starts with 'test_')
    const result = await pool.query('SELECT current_database() as db_name');
    const dbName = result.rows[0].db_name as string;
    expect(dbName).toMatch(/^test_/);
  });
});
