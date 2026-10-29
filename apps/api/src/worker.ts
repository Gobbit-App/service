import { writeFile } from 'node:fs/promises';
import type { Job } from 'pg-boss';
import { createDb, createPool } from '@gobbit/db';
import {
  DELETED_ITEM_PRUNE_CRON,
  EMBED_SWEEP_CRON,
  INGEST_PRUNE_CRON,
  INGEST_SWEEP_CRON,
  LINK_CHECK_READ_BYTES,
  MEDIA_SWEEP_CRON,
  SEARCH_QUERY_PRUNE_CRON,
  WAITLIST_PRUNE_CRON,
} from '@gobbit/shared';
import { parseEnv } from './env';
import { createBoss } from './jobs/boss';
import { createEmbedQueue, noopEmbedQueue } from './jobs/embed-queue';
import { createIngestHandler } from './jobs/ingest';
import { createIngestQueue } from './jobs/ingest-queue';
import { createIngestSweep } from './jobs/ingest-sweep';
import { createSafeFetch, createSafeImageFetch } from './fetch/safe-fetch';
import { extractPage } from './fetch/extract-page';
import { fetchLinkPreview } from './fetch/link-preview';
import { createLinkSnapshotHandler } from './jobs/link-snapshot';
import { createLinkSnapshotQueue, noopLinkSnapshotQueue } from './jobs/link-snapshot-queue';
import { scheduleLinkCheckSweep } from './jobs/link-check-sweep';
import { createLinkChecksRepo } from './repositories/link-checks.repo';
import { createLinkChecksService, createLinkProbe } from './services/link-checks.service';
import { createAssetUploader } from './services/media-upload-from-url';
import { normalizeRaw } from './ingest/normalize-raw';
import { createSharerRole } from './ingest/sharer-role';
import { autoPublish } from './ingest/auto-publish';
import { createPublishProposal, reviewTransaction } from './review/publish-proposal';
import { createImageReferenceCheck } from './services/image-reference';
import { runDedup } from './ingest/run-dedup';
import { createDedupRepo } from './repositories/dedup.repo';
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
import { createPruneDeletedItems } from './jobs/prune-deleted-items';
import { createPruneWaitlist } from './jobs/prune-waitlist';
import { createWaitlistRepo } from './repositories/waitlist.repo';
import { createIngestJobsRepo } from './repositories/ingest-jobs.repo';
import { createCloudinaryIngestUploads } from './media/ingest-uploads';
import { createCloudinaryMediaStore } from './media/media-store';
import { createMediaSweepJob } from './jobs/media-sweep';
import { createOrphanSweeper } from './services/media-sweep';
import { createAssetsRepo } from './repositories/assets.repo';
import { parseCloudinaryUrl } from './lib/cloudinary-url';
import { QUEUES, type EmbedItemJob, type IngestJobData, type LinkSnapshotJob } from './jobs/queues';
import { createEmbeddingsRepo } from './repositories/embeddings.repo';
import { createLlmCallsRepo } from './repositories/llm-calls.repo';
import { createSearchQueriesRepo } from './repositories/search-queries.repo';
import { defaultEmbedder, defaultExtractor } from './ai/providers';
import { childLogger, logDbIdleError } from './lib/logger';

const log = childLogger('worker');

/** Compose healthcheck: the file's mtime must be fresh (D72, see infra/docker-compose.yml). */
export const HEARTBEAT_FILE = process.env.WORKER_HEARTBEAT_FILE ?? '/tmp/worker-heartbeat';
const HEARTBEAT_MS = 30_000;

async function main() {
  const env = parseEnv();
  const pool = createPool(env.DATABASE_URL, { onIdleError: logDbIdleError });
  const db = createDb(pool);
  const boss = createBoss(env.DATABASE_URL, 'worker');

  await boss.start();
  await ensureQueues(boss);

  const prune = createPruneSearchQueries({ searchQueries: createSearchQueriesRepo(db) });
  await boss.schedule(QUEUES.pruneSearchQueries, SEARCH_QUERY_PRUNE_CRON);
  await boss.work(QUEUES.pruneSearchQueries, async () => {
    const removed = await prune();
    log.info({ removed }, 'pruned search_queries rows');
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
    log.info({ pruned, uploadsDeleted }, 'pruned ingest jobs');
  });

  // D132: cards deleted more than ITEM_UNDELETE_DAYS ago are purged weekly
  const pruneDeletedItems = createPruneDeletedItems({ items: createItemsRepo(db) });
  await boss.schedule(QUEUES.pruneDeletedItems, DELETED_ITEM_PRUNE_CRON);
  await boss.work(QUEUES.pruneDeletedItems, async () => {
    await pruneDeletedItems();
  });

  // D220: expired pending and old removed waitlist entries are deleted weekly
  const pruneWaitlist = createPruneWaitlist({ waitlist: createWaitlistRepo(db) });
  await boss.schedule(QUEUES.pruneWaitlist, WAITLIST_PRUNE_CRON);
  await boss.work(QUEUES.pruneWaitlist, async ([job]: Job[]) => {
    await pruneWaitlist(job?.id ?? 'unknown');
  });

  const embedder = defaultEmbedder(env);
  const workerEmbedQueue = embedder
    ? createEmbedQueue({
        sender: boss,
        embeddings: createEmbeddingsRepo(db),
        model: embedder.model,
      })
    : noopEmbedQueue;

  // D164: link checks need no image storage; one request per host at a time.
  await scheduleLinkCheckSweep(
    boss,
    createLinkChecksService({
      linkChecks: createLinkChecksRepo(db),
      probe: createLinkProbe({
        safeFetch: createSafeFetch({ accept: 'any', maxBytes: LINK_CHECK_READ_BYTES }),
        extract: extractPage,
      }),
    }),
  );

  if (env.CLOUDINARY_URL) {
    const mediaStore = createCloudinaryMediaStore(parseCloudinaryUrl(env.CLOUDINARY_URL));
    // D158: the database decides what is an orphan; Cloudinary is only asked to delete by id.
    const mediaSweep = createMediaSweepJob({
      sweeper: createOrphanSweeper({
        assets: createAssetsRepo(db),
        store: mediaStore,
        log,
      }),
    });
    await boss.schedule(QUEUES.mediaSweep, MEDIA_SWEEP_CRON);
    await boss.work(QUEUES.mediaSweep, async () => {
      await mediaSweep();
    });

    // D163: the API enqueues after commit only when CLOUDINARY_URL is set, so the queue is
    // worked under the same condition.
    const linkSnapshot = createLinkSnapshotHandler({
      items: createItemsRepo(db),
      fetchPreview: (url) =>
        fetchLinkPreview(
          { safeFetch: createSafeFetch(), extract: extractPage, log: log.info.bind(log) },
          url,
        ),
      uploadFromUrl: createAssetUploader({
        assets: createAssetsRepo(db),
        store: mediaStore,
        imageFetch: createSafeImageFetch(),
        log,
      }).uploadFromUrl,
      sender: boss,
      embedQueue: workerEmbedQueue,
      log,
    });
    await boss.work(
      QUEUES.linkSnapshot,
      { batchSize: 1, localConcurrency: env.WORKER_CONCURRENCY },
      async (jobs: Job<LinkSnapshotJob>[]) => {
        for (const job of jobs) {
          const outcome = await linkSnapshot(job.data);
          log.info({ itemId: job.data.itemId, outcome }, 'link snapshot job');
        }
      },
    );
  } else {
    await boss.unschedule(QUEUES.mediaSweep);
  }

  const extract = defaultExtractor(env);
  if (extract) {
    const ingestJobs = createIngestJobsRepo(db);
    const decks = createDecksRepo(db);
    const roleOf = createSharerRole({
      users: createUsersRepo(db),
      decks,
      memberships: createMembershipsRepo(db),
    });
    const ingestLinkSnapshotQueue = env.CLOUDINARY_URL
      ? createLinkSnapshotQueue({ sender: boss })
      : noopLinkSnapshotQueue;
    const ingest = createIngestHandler({
      jobs: ingestJobs,
      categories: createCategoriesRepo(db),
      items: createItemsRepo(db),
      roleOf,
      normalize: (raw) =>
        normalizeRaw(raw, {
          safeFetch: createSafeFetch(),
          imageUrl: ingestUploads ? (id) => ingestUploads.llmUrl(id) : (id) => id,
        }),
      extraction: { ...extract, llmCalls: createLlmCallsRepo(db) },
      embedQueue: workerEmbedQueue,
      linkSnapshotQueue: ingestLinkSnapshotQueue,
      assets: createAssetsRepo(db),
      // D193: publishers' shares on opted-in decks skip review, through review's own routine.
      autoPublish: (input) =>
        autoPublish(
          {
            decks,
            roleOf,
            publishProposal: createPublishProposal({
              transaction: reviewTransaction(db),
              imageReference: createImageReferenceCheck(createAssetsRepo(db)),
              now: () => new Date(),
            }),
            jobs: ingestJobs,
            embedQueue: workerEmbedQueue,
            linkSnapshotQueue: ingestLinkSnapshotQueue,
            logger: childLogger('ingest'),
          },
          input,
        ),
      dedup: (input) =>
        runDedup(
          {
            dedup: createDedupRepo(db),
            embedder,
            embeddings: createEmbeddingsRepo(db),
            llmCalls: createLlmCallsRepo(db),
          },
          input,
        ),
    });
    const ingestSweep = createIngestSweep({
      jobs: ingestJobs,
      queue: createIngestQueue({ sender: boss }),
    });

    await boss.schedule(QUEUES.ingestSweep, INGEST_SWEEP_CRON);
    await boss.work(QUEUES.ingestSweep, async () => {
      const { requeued, failed } = await ingestSweep();
      if (requeued + failed > 0) {
        log.info({ requeued, failed }, 'ingest sweep handled stale jobs');
      }
    });
    await boss.work(
      QUEUES.ingest,
      { batchSize: 1, localConcurrency: env.WORKER_CONCURRENCY },
      async (jobs: Job<IngestJobData>[]) => {
        for (const job of jobs) {
          const outcome = await ingest(job.data.jobId, { signal: job.signal });
          log.info({ ingestJobId: job.data.jobId, outcome }, 'ingest job');
        }
      },
    );
    log.info(
      { model: extract.model, escalationModel: extract.escalationModel },
      'ingestion enabled',
    );
  } else {
    // D93: without a chat key POST /ingest is 503, so there is nothing to extract.
    await boss.unschedule(QUEUES.ingestSweep);
    log.warn('OPENROUTER_API_KEY / ANTHROPIC_API_KEY not set; ingestion disabled');
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
      if (queued > 0) log.info({ queued }, 'embed sweep queued stale items');
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
    log.info({ model: embedder.model, concurrency: env.WORKER_CONCURRENCY }, 'embedding enabled');
  } else {
    // D73: without a key nothing is embedded; drop the sweep so it doesn't spin.
    await boss.unschedule(QUEUES.embedSweep);
    log.warn('OPENROUTER_API_KEY / OPENAI_API_KEY not set; embedding disabled');
  }

  const heartbeat = async () => {
    try {
      await pool.query('select 1');
      await writeFile(HEARTBEAT_FILE, new Date().toISOString());
    } catch (err) {
      log.error({ err }, 'heartbeat failed');
    }
  };
  await heartbeat();
  const timer = setInterval(() => void heartbeat(), HEARTBEAT_MS);

  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    clearInterval(timer);
    log.info('draining');
    boss
      .stop({ graceful: true, timeout: 20_000 })
      .catch((err: unknown) => log.error({ err }, 'stop failed'))
      .finally(() => pool.end().finally(() => process.exit(0)));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err: unknown) => {
  log.fatal({ err }, 'worker failed to start');
  process.exit(1);
});
