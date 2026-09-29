import { parseEnv } from './env';
import { createPool, createDb } from '@pb/db';
import { createApp } from './app';
import { createMailer } from './mail/create-mailer';
import { serve } from '@hono/node-server';

async function main() {
  const env = parseEnv();

  const pool = createPool(env.DATABASE_URL);
  const db = createDb(pool);

  const app = createApp({ db, pool, env, mailer: createMailer(env) });

  const server = serve({
    fetch: app.fetch,
    port: env.PORT,
  });

  console.log(`API listening on :${env.PORT} (mail: ${env.MAIL_PROVIDER}, url: ${env.API_URL})`);

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
