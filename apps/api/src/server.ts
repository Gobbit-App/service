import { randomUUID } from 'node:crypto';
import { parseEnv, type Env } from './env';
import { createPool, createDb, type Db } from '@pb/db';
import type { PgBoss } from 'pg-boss';
import { createApp } from './app';
import { createMailer } from './mail/create-mailer';
import { serve } from '@hono/node-server';
import { createBoss } from './jobs/boss';
import { createEmbedQueue, noopEmbedQueue, type EmbedQueue } from './jobs/embed-queue';
import { createIngestQueue, noopIngestQueue, type IngestQueue } from './jobs/ingest-queue';
import { ensureQueues } from './jobs/ensure-queues';
import {
  createLinkSnapshotQueue,
  noopLinkSnapshotQueue,
  type LinkSnapshotQueue,
} from './jobs/link-snapshot-queue';
import { createEmbeddingsRepo } from './repositories/embeddings.repo';
import { hasEmbeddingProvider, hasExtractProvider } from './ai/providers';
import { childLogger, logDbIdleError } from './lib/logger';
import { checkCloudinaryCredentials } from './media/cloudinary-check';
import { recordRegistrationMode } from './services/registration-mode';
import { recordAnalyticsConfig } from './public/analytics';

const log = childLogger('api');

interface Queues {
  embedQueue: EmbedQueue;
  ingestQueue: IngestQueue;
  linkSnapshotQueue: LinkSnapshotQueue;
  boss?: PgBoss;
}

const NO_QUEUES: Queues = {
  embedQueue: noopEmbedQueue,
  ingestQueue: noopIngestQueue,
  linkSnapshotQueue: noopLinkSnapshotQueue,
};

/**
 * D72/D73/D93/D163: send-only pg-boss when embedding, extraction or image storage is configured;
 * a queue outage never blocks startup (the worker's sweeps and the backfill pick up what wasn't
 * sent).
 */
async function startQueues(env: Env, db: Db): Promise<Queues> {
  const embeds = hasEmbeddingProvider(env);
  const extracts = hasExtractProvider(env);
  const snapshots = Boolean(env.CLOUDINARY_URL);
  if (!embeds && !extracts && !snapshots) return NO_QUEUES;
  const boss = createBoss(env.DATABASE_URL, 'sender');
  try {
    await boss.start();
    await ensureQueues(boss);
  } catch (err) {
    log.error({ err }, 'pg-boss unavailable, relying on the sweepers');
    return NO_QUEUES;
  }
  return {
    embedQueue: embeds
      ? createEmbedQueue({
          sender: boss,
          embeddings: createEmbeddingsRepo(db),
          model: env.EMBEDDING_MODEL,
        })
      : noopEmbedQueue,
    ingestQueue: extracts ? createIngestQueue({ sender: boss }) : noopIngestQueue,
    linkSnapshotQueue: snapshots
      ? createLinkSnapshotQueue({ sender: boss })
      : noopLinkSnapshotQueue,
    boss,
  };
}

async function main() {
  const env = parseEnv();

  const pool = createPool(env.DATABASE_URL, { onIdleError: logDbIdleError });
  const db = createDb(pool);
  const { embedQueue, ingestQueue, linkSnapshotQueue, boss } = await startQueues(env, db);

  const app = createApp({
    db,
    pool,
    env,
    mailer: createMailer(env),
    search: { embedQueue },
    ingest: { queue: ingestQueue },
    media: { linkSnapshotQueue },
  });

  const server = serve({
    fetch: app.fetch,
    port: env.PORT,
  });

  log.info(
    {
      port: env.PORT,
      mail: env.MAIL_PROVIDER,
      apiUrl: env.API_URL ?? null,
      gitSha: env.GIT_SHA ?? null,
    },
    'api listening',
  );
  const bootId = randomUUID();
  recordRegistrationMode(env, { bootId });
  recordAnalyticsConfig(env, { bootId });
  if (env.CLOUDINARY_URL) void checkCloudinaryCredentials(env.CLOUDINARY_URL);
  else log.warn('CLOUDINARY_URL not set; image uploads and OG images are disabled');

  const handleShutdown = () => {
    server.close();
    const stopBoss = boss ? boss.stop({ graceful: false }) : Promise.resolve();
    stopBoss
      .catch((err: unknown) => log.error({ err }, 'pg-boss stop failed'))
      .finally(() => pool.end().finally(() => process.exit(0)));
  };

  process.on('SIGTERM', handleShutdown);
  process.on('SIGINT', handleShutdown);
}

main().catch((err: unknown) => {
  log.fatal({ err }, 'api failed to start');
  process.exit(1);
});
