import { createPool } from '../src/client';
import { parseOwnerSeedEnv, runSeed } from '../seed/run-seed';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://pb:pb@localhost:5432/pb';

if (process.env.NODE_ENV === 'production' && !process.argv.includes('--allow-prod')) {
  console.error('Refusing to seed with NODE_ENV=production (pass --allow-prod to override)');
  process.exit(1);
}

let config;
try {
  config = parseOwnerSeedEnv(process.env);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}

const pool = createPool(DATABASE_URL);

try {
  const result = await runSeed(pool, config);
  console.log(
    `Seeded owner ${config.email} (user ${result.userId})` +
      (result.smokeSession ? ' with smoke session' : ''),
  );
} catch (err) {
  console.error('Seed failed:', err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
