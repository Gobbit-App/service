import { createPool } from '../src/client';
import { runMigrations, getLatestMigrationTag } from '../src/migrations';

const databaseUrl = process.env.DATABASE_URL ?? 'postgres://gobbit:gobbit@localhost:5432/gobbit';

const pool = createPool(databaseUrl);

try {
  await runMigrations(pool);
  const tag = await getLatestMigrationTag(pool);
  console.log(`migrated → ${tag}`);
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
