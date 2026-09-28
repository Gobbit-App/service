import { createPool } from '../src/client';
import { runSeed } from '../seed/run-seed';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://pb:pb@localhost:5432/pb';
const DEV_USER = process.env.DEV_USER;

if (process.env.NODE_ENV === 'production' && !process.argv.includes('--allow-prod')) {
  console.error('Refusing to seed with NODE_ENV=production (pass --allow-prod to override)');
  process.exit(1);
}

const pool = createPool(DATABASE_URL);

try {
  const result = await runSeed(pool, { devEmail: DEV_USER });
  console.log(`Seeded ${result.items} items`);
} catch (err) {
  console.error('Seed failed:', err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
