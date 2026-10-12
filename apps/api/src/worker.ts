import { writeFile } from 'node:fs/promises';
import type { Job } from 'pg-boss';
import { createDb, createPool } from '@pb/db';
import { EMBED_SWEEP_CRON, SEARCH_QUERY_PRUNE_CRON } from '@pb/shared';
import { parseEnv } from './env';
import { createBoss } from './jobs/boss';
import { createEmbedItemHandler } from './jobs/embed-item';
import { createEmbedSweep } from './jobs/embed-sweep';
import { ensureQueues } from './jobs/ensure-queues';
import { createPruneSearchQueries } from './jobs/prune-search-queries';
import { QUEUES, type EmbedItemJob } from './jobs/queues';
import { createEmbeddingsRepo } from './repositories/embeddings.repo';
import { createLlmCallsRepo } from './repositories/llm-calls.repo';
import { createSearchQueriesRepo } from './repositories/search-queries.repo';
import { defaultEmbedder } from './services/search-wiring';

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

  const embedder = defaultEmbedder(env);
  if (embedder) {
    const embeddings = createEmbeddingsRepo(db);
    const embedItem = createEmbedItemHandler({
      embedder,
      embeddings,
      llmCalls: createLlmCallsRepo(db),
    });
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
    console.log('[worker] OPENAI_API_KEY not set — embedding disabled');
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
