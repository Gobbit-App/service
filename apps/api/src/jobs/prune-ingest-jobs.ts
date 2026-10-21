import { INGEST_RAW_RETENTION_DAYS } from '@pb/shared';
import type { IngestJobsRepo } from '../repositories/ingest-jobs.repo';
import type { IngestUploadStore } from '../media/ingest-uploads';
import { lineSink } from '../lib/logger';

const DAY_MS = 86_400_000;

export interface PruneIngestResult {
  pruned: number;
  uploadsDeleted: number;
}

/**
 * D94/D101: nulls `raw`/`normalized` on jobs older than the retention window and deletes
 * the uploads of jobs that never became a card (failed/discarded). Published cards keep
 * their image. Upload deletion failures are logged and skipped, never fatal.
 */
export function createPruneIngestJobs(deps: {
  jobs: Pick<IngestJobsRepo, 'pruneBefore'>;
  uploads: Pick<IngestUploadStore, 'deleteForJob'> | null;
  now?: () => Date;
  retentionDays?: number;
  log?: (msg: string) => void;
}) {
  const {
    jobs,
    uploads,
    now = () => new Date(),
    retentionDays = INGEST_RAW_RETENTION_DAYS,
    log = lineSink('worker'),
  } = deps;

  return async function prune(): Promise<PruneIngestResult> {
    const cutoff = new Date(now().getTime() - retentionDays * DAY_MS);
    const { pruned, withUploads } = await jobs.pruneBefore(cutoff);
    let uploadsDeleted = 0;
    if (uploads) {
      for (const jobId of withUploads) {
        try {
          await uploads.deleteForJob(jobId);
          uploadsDeleted += 1;
        } catch (err) {
          log(
            `[worker] ingest upload cleanup failed for ${jobId}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }
    return { pruned, uploadsDeleted };
  };
}
