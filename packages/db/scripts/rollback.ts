import { createPool } from '../src/client';
import { rollbackLatest } from '../src/migrations';

const databaseUrl = process.env.DATABASE_URL ?? 'postgres://pb:pb@localhost:5432/pb';

try {
  const pool = createPool(databaseUrl);

  try {
    const tag = await rollbackLatest(pool);
    if (tag) {
      console.log(`rolled back ${tag}`);
    } else {
      console.log('nothing to roll back');
    }
  } finally {
    await pool.end();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
