import { parseEnv } from './env';
import { createPool, createDb } from '@pb/db';
import { createApp } from './app';
import { serve } from '@hono/node-server';

async function main() {
  const env = parseEnv();

  const pool = createPool(env.DATABASE_URL);
  const db = createDb(pool);

  const app = createApp({
    db,
    pool,
    env: {
      DEV_AUTH_ENABLED: env.DEV_AUTH_ENABLED,
      DEV_API_TOKEN: env.DEV_API_TOKEN,
    },
  });

  const server = serve({
    fetch: app.fetch,
    port: env.PORT,
  });

  const authStatus = env.DEV_AUTH_ENABLED ? ' (dev auth enabled)' : '';
  console.log(`API listening on :${env.PORT}${authStatus}`);

  const handleShutdown = () => {
    server.close();
    pool.end().finally(() => process.exit(0));
  };

  process.on('SIGTERM', handleShutdown);
  process.on('SIGINT', handleShutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
