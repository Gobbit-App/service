import { INGEST_JOB_RETRIES } from '@pb/shared';

/** Queue names shared by the API (sender) and the worker (D72, D80, D93, D132, D158). */
export const QUEUES = {
  embedItem: 'embed-item',
  embedSweep: 'embed-sweep',
  pruneSearchQueries: 'prune-search-queries',
  ingest: 'ingest',
  ingestSweep: 'ingest-sweep',
  pruneIngestJobs: 'prune-ingest-jobs',
  /** D132: weekly hard purge of cards deleted more than 30 days ago. */
  pruneDeletedItems: 'prune-deleted-items',
  /** D158: daily delete of unreferenced images past the grace period (Cloudinary only). */
  mediaSweep: 'media-sweep',
} as const;

export interface EmbedItemJob {
  itemId: string;
}

export interface IngestJobData {
  jobId: string;
}

/** The slice of pg-boss the enqueuers need; a recording fake stands in for it in tests. */
export interface JobSender {
  send(
    name: string,
    data: object,
    options?: { singletonKey?: string; retryLimit?: number; retryBackoff?: boolean },
  ): Promise<string | null>;
}

/** D72: retries with exponential backoff for provider blips. */
export const EMBED_ITEM_SEND_OPTIONS = { retryLimit: 3, retryBackoff: true } as const;

/** D93: pg-boss retries provider blips; the row's `attempts` caps re-runs from the sweep. */
export const INGEST_SEND_OPTIONS = { retryLimit: INGEST_JOB_RETRIES, retryBackoff: true } as const;
