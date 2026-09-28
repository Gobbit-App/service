import { describe, it, expect } from 'vitest';
import type { Pool } from 'pg';
import {
  runMigrations,
  rollbackLatest,
  getLatestMigrationTag,
  readJournal,
} from '../src/migrations';
import { withTestDb } from './db-fixture';

type SchemaSnapshot = {
  tables: Array<{
    table_name: string;
    column_name: string;
    data_type: string;
    is_nullable: string;
    column_default: string | null;
  }>;
  indexes: Array<{
    indexname: string;
    indexdef: string;
  }>;
  constraints: Array<{
    conname: string;
    definition: string;
  }>;
  triggers: Array<{
    tgname: string;
  }>;
  enums: Array<{
    typname: string;
    labels: string[];
  }>;
};

async function snapshot(pool: Pool): Promise<SchemaSnapshot> {
  const [columnsRes, indexesRes, constraintsRes, triggersRes, enumsRes] = await Promise.all([
    pool.query(
      `SELECT table_name, column_name, data_type, is_nullable, column_default
         FROM information_schema.columns
         WHERE table_schema = 'public'
         ORDER BY table_name, ordinal_position`,
    ),
    pool.query(
      `SELECT indexname, indexdef
         FROM pg_indexes
         WHERE schemaname = 'public'
         ORDER BY indexname`,
    ),
    pool.query(
      `SELECT c.conname, pg_get_constraintdef(c.oid) as definition
         FROM pg_constraint c
         JOIN pg_namespace n ON c.connamespace = n.oid
         WHERE n.nspname = 'public'
         ORDER BY c.conname`,
    ),
    pool.query(
      `SELECT t.tgname
         FROM pg_trigger t
         JOIN pg_class c ON t.tgrelid = c.oid
         JOIN pg_namespace n ON c.relnamespace = n.oid
         WHERE NOT t.tgisinternal AND n.nspname = 'public'
         ORDER BY t.tgname`,
    ),
    pool.query(
      `SELECT t.typname, array_agg(e.enumlabel ORDER BY e.enumsortorder) as labels
         FROM pg_type t
         JOIN pg_enum e ON t.oid = e.enumtypid
         JOIN pg_namespace n ON t.typnamespace = n.oid
         WHERE n.nspname = 'public' AND t.typtype = 'e'
         GROUP BY t.typname, t.oid
         ORDER BY t.typname`,
    ),
  ]);

  return {
    tables: columnsRes.rows,
    indexes: indexesRes.rows,
    constraints: constraintsRes.rows,
    triggers: triggersRes.rows,
    enums: enumsRes.rows,
  };
}

describe('migrations: reversibility', () => {
  const ctx = withTestDb({ template: false });

  it('should reversibly migrate and rollback with identical schema', async () => {
    // Migrate from empty database
    await runMigrations(ctx.pool);

    // Verify tag matches journal
    const latestTag = await getLatestMigrationTag(ctx.pool);
    const journal = readJournal();
    const lastJournalEntry = journal.entries[journal.entries.length - 1];
    expect(latestTag).toBe(lastJournalEntry?.tag ?? null);

    // Take snapshot after migration
    const snapshotA = await snapshot(ctx.pool);

    // Rollback all migrations
    const rolledBackTags: string[] = [];
    let currentTag: string | null = await getLatestMigrationTag(ctx.pool);
    while (currentTag !== null) {
      const tag = await rollbackLatest(ctx.pool);
      if (tag !== null) {
        rolledBackTags.push(tag);
      }
      currentTag = await getLatestMigrationTag(ctx.pool);
    }

    // Verify rollback tags match journal in reverse
    const journalTags = journal.entries.map((e) => e.tag);
    const reversedJournalTags = [...journalTags].reverse();
    expect(rolledBackTags).toEqual(reversedJournalTags);

    // Verify no public tables or enums after rollback
    const emptySnapshot = await snapshot(ctx.pool);
    expect(emptySnapshot.tables).toHaveLength(0);
    expect(emptySnapshot.enums).toHaveLength(0);

    // Migrate again
    await runMigrations(ctx.pool);

    // Verify snapshot matches original
    const snapshotB = await snapshot(ctx.pool);
    expect(snapshotB).toEqual(snapshotA);

    // Verify migrations table has correct row count
    const countRes = await ctx.pool.query(
      'SELECT COUNT(*) as count FROM drizzle.__drizzle_migrations',
    );
    expect(parseInt(countRes.rows[0].count as string, 10)).toBe(journal.entries.length);

    // Migrate once more (should be no-op)
    await runMigrations(ctx.pool);
    const countRes2 = await ctx.pool.query(
      'SELECT COUNT(*) as count FROM drizzle.__drizzle_migrations',
    );
    expect(parseInt(countRes2.rows[0].count as string, 10)).toBe(journal.entries.length);
  });
});
