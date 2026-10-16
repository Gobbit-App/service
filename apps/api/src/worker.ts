import { writeFile } from 'node:fs/promises';
import type { Job } from 'pg-boss';
import { createDb, createPool } from '@pb/db';
import {
  EMBED_SWEEP_CRON,
  INGEST_PRUNE_CRON,
  INGEST_SWEEP_CRON,
  SEARCH_QUERY_PRUNE_CRON,
} from '@pb/shared';
import { parseEnv } from './env';
import { createBoss } from './jobs/boss';
import { createEmbedQueue, noopEmbedQueue } from './jobs/embed-queue';
import { createIngestHandler } from './jobs/ingest';
import { createIngestQueue } from './jobs/ingest-queue';
import { createIngestSweep } from './jobs/ingest-sweep';
import { createSafeFetch } from './fetch/safe-fetch';
import { normalizeRaw } from './ingest/normalize-raw';
import { createSharerRole } from './ingest/sharer-role';
import { createCategoriesRepo } from './repositories/categories.repo';
import { createDecksRepo } from './repositories/decks.repo';
import { createItemsRepo } from './repositories/items.repo';
import { createMembershipsRepo } from './repositories/memberships.repo';
import { createUsersRepo } from './repositories/users.repo';
import { createEmbedItemHandler } from './jobs/embed-item';
import { withEmbedItemLog } from './jobs/embed-item-log';
import { createEmbedSweep } from './jobs/embed-sweep';
import { ensureQueues } from './jobs/ensure-queues';
import { createPruneSearchQueries } from './jobs/prune-search-queries';
import { createPruneIngestJobs } from './jobs/prune-ingest-jobs';
import { createIngestJobsRepo } from './repositories/ingest-jobs.repo';
import { createCloudinaryIngestUploads } from './media/ingest-uploads';
import { QUEUES, type EmbedItemJob, type IngestJobData } from './jobs/queues';
import { createEmbeddingsRepo } from './repositories/embeddings.repo';
import { createLlmCallsRepo } from './repositories/llm-calls.repo';
import { createSearchQueriesRepo } from './repositories/search-queries.repo';
import { defaultEmbedder, defaultExtractor } from './ai/providers';

/** Compose healthcheck: the file's mtime must be fresh (D72, see infra/docker-compose.yml). */
export const HEARTBEAT_FILE = process.env.WORKER_HEARTBEAT_FILE ?? '/tmp/worker-heartbeat';
const HEARTBEAT_MS = 30_000;

async function main() {
  const env = parseEnv();
  const pool = createPool(env.DATABASE_URL);
  const db = createDb(pool);
  const boss = createBoss(env.DATABASE_URL, 'worker');

  await boss.start();
  await ensureQueues(boss);

  const prune = createPruneSearchQueries({ searchQueries: createSearchQueriesRepo(db) });
  await boss.schedule(QUEUES.pruneSearchQueries, SEARCH_QUERY_PRUNE_CRON);
  await boss.work(QUEUES.pruneSearchQueries, async () => {
    const removed = await prune();
    console.log(`[worker] pruned ${removed} search_queries rows`);
  });

  const ingestUploads = env.CLOUDINARY_URL
    ? createCloudinaryIngestUploads(env.CLOUDINARY_URL)
    : null;
  const pruneIngest = createPruneIngestJobs({
    jobs: createIngestJobsRepo(db),
    uploads: ingestUploads,
  });
  await boss.schedule(QUEUES.pruneIngestJobs, INGEST_PRUNE_CRON);
  await boss.work(QUEUES.pruneIngestJobs, async () => {
    const { pruned, uploadsDeleted } = await pruneIngest();
    console.log(`[worker] pruned ${pruned} ingest jobs (${uploadsDeleted} upload sets deleted)`);
  });
  const embedder = defaultEmbedder(env);
  const extract = defaultExtractor(env);
  if (extract) {
    const ingestJobs = createIngestJobsRepo(db);
    const ingest = createIngestHandler({
      jobs: ingestJobs,
      categories: createCategoriesRepo(db),
      items: createItemsRepo(db),
      roleOf: createSharerRole({
        users: createUsersRepo(db),
        decks: createDecksRepo(db),
        memberships: createMembershipsRepo(db),
      }),
      normalize: (raw) =>
        normalizeRaw(raw, {
          safeFetch: createSafeFetch(),
          imageUrl: ingestUploads ? (id) => ingestUploads.llmUrl(id) : (id) => id,
        }),
      extraction: { ...extract, llmCalls: createLlmCallsRepo(db) },
      embedQueue: embedder
        ? createEmbedQueue({
            sender: boss,
            embeddings: createEmbeddingsRepo(db),
            model: embedder.model,
          })
        : noopEmbedQueue,
    });
    const ingestSweep = createIngestSweep({
      jobs: ingestJobs,
      queue: createIngestQueue({ sender: boss }),
    });

    await boss.schedule(QUEUES.ingestSweep, INGEST_SWEEP_CRON);
    await boss.work(QUEUES.ingestSweep, async () => {
      const { requeued, failed } = await ingestSweep();
      if (requeued + failed > 0) {
        console.log(`[worker] ingest sweep requeued ${requeued}, failed ${failed} stale jobs`);
      }
    });
    await boss.work(
      QUEUES.ingest,
      { batchSize: 1, localConcurrency: env.WORKER_CONCURRENCY },
      async (jobs: Job<IngestJobData>[]) => {
        for (const job of jobs) {
          const outcome = await ingest(job.data.jobId, { signal: job.signal });
          console.log(`[worker] ingest ${job.data.jobId}: ${outcome}`);
        }
      },
    );
    console.log(`[worker] ingesting with ${extract.model} (escalation ${extract.escalationModel})`);
  } else {
    // D93: without a chat key POST /ingest is 503, so there is nothing to extract.
    await boss.unschedule(QUEUES.ingestSweep);
    console.log('[worker] OPENROUTER_API_KEY / ANTHROPIC_API_KEY not set — ingestion disabled');
  }

  if (embedder) {
    const embeddings = createEmbeddingsRepo(db);
    const embedItem = withEmbedItemLog(
      createEmbedItemHandler({
        embedder,
        embeddings,
        llmCalls: createLlmCallsRepo(db),
      }),
    );
    const sweep = createEmbedSweep({ sender: boss, embeddings, model: embedder.model });

    await boss.schedule(QUEUES.embedSweep, EMBED_SWEEP_CRON);
    await boss.work(QUEUES.embedSweep, async () => {
      const queued = await sweep();
      if (queued > 0) console.log(`[worker] sweep queued ${queued} stale items`);
    });
    await boss.work(
      QUEUES.embedItem,
      { batchSize: 1, localConcurrency: env.WORKER_CONCURRENCY },
      async (jobs: Job<EmbedItemJob>[]) => {
        for (const job of jobs) {
          await embedItem(job.data.itemId, { id: job.id, signal: job.signal });
        }
      },
    );
    console.log(
      `[worker] embedding with ${embedder.model} (concurrency ${env.WORKER_CONCURRENCY})`,
    );
  } else {
    // D73: without a key nothing is embedded; drop the sweep so it doesn't spin.
    await boss.unschedule(QUEUES.embedSweep);
    console.log('[worker] OPENROUTER_API_KEY / OPENAI_API_KEY not set — embedding disabled');
  }

  const heartbeat = async () => {
    try {
      await pool.query('select 1');
      await writeFile(HEARTBEAT_FILE, new Date().toISOString());
    } catch (err) {
      console.error('[worker] heartbeat failed:', err instanceof Error ? err.message : err);
    }
  };
  await heartbeat();
  const timer = setInterval(() => void heartbeat(), HEARTBEAT_MS);

  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    clearInterval(timer);
    console.log('[worker] draining…');
    boss
      .stop({ graceful: true, timeout: 20_000 })
      .catch((err: unknown) => console.error('[worker] stop failed:', err))
      .finally(() => pool.end().finally(() => process.exit(0)));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
