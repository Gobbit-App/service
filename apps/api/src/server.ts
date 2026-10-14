import { parseEnv, type Env } from './env';
import { createPool, createDb, type Db } from '@pb/db';
import type { PgBoss } from 'pg-boss';
import { createApp } from './app';
import { createMailer } from './mail/create-mailer';
import { serve } from '@hono/node-server';
import { createBoss } from './jobs/boss';
import { createEmbedQueue, noopEmbedQueue, type EmbedQueue } from './jobs/embed-queue';
import { ensureQueues } from './jobs/ensure-queues';
import { createEmbeddingsRepo } from './repositories/embeddings.repo';
import { hasEmbeddingProvider } from './ai/providers';

/** D72/D73: send-only pg-boss when embedding is configured; a queue outage never blocks startup. */
async function startEmbedQueue(env: Env, db: Db): Promise<{ queue: EmbedQueue; boss?: PgBoss }> {
  if (!hasEmbeddingProvider(env)) return { queue: noopEmbedQueue };
  const boss = createBoss(env.DATABASE_URL, 'sender');
  try {
    await boss.start();
    await ensureQueues(boss);
  } catch (err) {
    console.error('[api] pg-boss unavailable, relying on the sweeper:', err);
    return { queue: noopEmbedQueue };
  }
  const queue = createEmbedQueue({
    sender: boss,
    embeddings: createEmbeddingsRepo(db),
    model: env.EMBEDDING_MODEL,
  });
  return { queue, boss };
}

async function main() {
  const env = parseEnv();

  const pool = createPool(env.DATABASE_URL);
  const db = createDb(pool);
  const { queue: embedQueue, boss } = await startEmbedQueue(env, db);

  const app = createApp({
    db,
    pool,
    env,
    mailer: createMailer(env),
    search: { embedQueue },
  });

  const server = serve({
    fetch: app.fetch,
    port: env.PORT,
  });

  console.log(`API listening on :${env.PORT} (mail: ${env.MAIL_PROVIDER}, url: ${env.API_URL})`);

  const handleShutdown = () => {
    server.close();
    const stopBoss = boss ? boss.stop({ graceful: false }) : Promise.resolve();
    stopBoss
      .catch((err: unknown) => console.error('[api] pg-boss stop failed:', err))
      .finally(() => pool.end().finally(() => process.exit(0)));
  };

  process.on('SIGTERM', handleShutdown);
  process.on('SIGINT', handleShutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
