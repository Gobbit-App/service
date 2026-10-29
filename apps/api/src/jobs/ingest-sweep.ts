import { INGEST_SWEEP_STALE_MS } from '@gobbit/shared';
import type { IngestJobsRepo } from '../repositories/ingest-jobs.repo';
import type { IngestQueue } from './ingest-queue';
import { isLastAttempt } from './ingest';

/**
 * D93: heals lost sends and crashed workers. Queued/running jobs untouched for
 * INGEST_SWEEP_STALE_MS are re-enqueued; ones that already used every attempt are failed.
 */
export function createIngestSweep(deps: {
  jobs: Pick<IngestJobsRepo, 'listStale' | 'setStatus'>;
  queue: IngestQueue;
  now?: () => Date;
}) {
  const { jobs, queue } = deps;
  const now = deps.now ?? (() => new Date());

  return async function sweep(): Promise<{ requeued: number; failed: number }> {
    const at = now();
    const stale = await jobs.listStale(new Date(at.getTime() - INGEST_SWEEP_STALE_MS));
    let requeued = 0;
    let failed = 0;
    for (const job of stale) {
      if (isLastAttempt(job.attempts)) {
        await jobs.setStatus(job.id, 'failed', 'stalled', at);
        failed++;
      } else {
        await queue.enqueue(job.id);
        requeued++;
      }
    }
    return { requeued, failed };
  };
}
