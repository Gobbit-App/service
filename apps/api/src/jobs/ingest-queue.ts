import { INGEST_SEND_OPTIONS, QUEUES, type IngestJobData, type JobSender } from './queues';
import { lineSink } from '../lib/logger';

/** Called after an ingest job row is inserted (D93). Never throws. */
export interface IngestQueue {
  enqueue(jobId: string): Promise<void>;
}

/** No sender (pg-boss down or not started): the ingest sweep picks queued jobs up. */
export const noopIngestQueue: IngestQueue = {
  async enqueue() {},
};

export function createIngestQueue(deps: {
  sender: JobSender;
  log?: (message: string) => void;
}): IngestQueue {
  const { sender, log = lineSink('ingest-queue') } = deps;

  return {
    async enqueue(jobId) {
      try {
        const data: IngestJobData = { jobId };
        await sender.send(QUEUES.ingest, data, { singletonKey: jobId, ...INGEST_SEND_OPTIONS });
      } catch (err) {
        // The 202 is already decided; the sweep re-sends stale queued jobs.
        log(
          `[ingest-queue] enqueue failed for ${jobId}: ${err instanceof Error ? err.message : err}`,
        );
      }
    },
  };
}
