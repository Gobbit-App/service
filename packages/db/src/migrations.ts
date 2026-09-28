import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import type pg from 'pg';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb } from './client';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));
const DOWN_DIR = path.join(MIGRATIONS_DIR, 'down');

interface JournalEntry {
  idx: number;
  when: number;
  tag: string;
}

interface JournalData {
  entries: JournalEntry[];
}

export function readJournal(): { entries: JournalEntry[] } {
  const journalPath = path.join(MIGRATIONS_DIR, 'meta', '_journal.json');
  const content = readFileSync(journalPath, 'utf-8');
  return JSON.parse(content) as JournalData;
}

export function latestJournalTag(): string | null {
  const journal = readJournal();
  if (journal.entries.length === 0) {
    return null;
  }
  return journal.entries[journal.entries.length - 1].tag;
}

export async function runMigrations(pool: pg.Pool): Promise<void> {
  const db = createDb(pool);
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
}

export async function getLatestMigrationTag(pool: pg.Pool): Promise<string | null> {
  try {
    const result = await pool.query(
      'SELECT created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1',
    );

    if (result.rows.length === 0) {
      return null;
    }

    const createdAt = Number(result.rows[0].created_at);
    const journal = readJournal();

    const entry = journal.entries.find((e) => e.when === createdAt);
    return entry?.tag ?? null;
  } catch (err) {
    const pgErr = err as { code?: string } | null;
    if (pgErr?.code === '42P01' || pgErr?.code === '3F000') {
      return null;
    }
    throw err;
  }
}

export async function rollbackLatest(pool: pg.Pool): Promise<string | null> {
  const tag = await getLatestMigrationTag(pool);

  if (!tag) {
    return null;
  }

  const downFile = path.join(DOWN_DIR, `${tag}.down.sql`);
  if (!existsSync(downFile)) {
    throw new Error(`No down migration for ${tag}`);
  }

  const downSql = readFileSync(downFile, 'utf-8');

  // Find the when value from the journal
  const journal = readJournal();
  const entry = journal.entries.find((e) => e.tag === tag);
  if (!entry) {
    throw new Error(`Journal entry not found for tag ${tag}`);
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query(downSql);
    await client.query('DELETE FROM drizzle.__drizzle_migrations WHERE created_at = $1', [
      entry.when,
    ]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return tag;
}
