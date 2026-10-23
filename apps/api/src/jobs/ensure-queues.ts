import type { PgBoss } from 'pg-boss';
import { QUEUES } from './queues';

/** `stately` + singletonKey: at most one queued and one active embed per item (D72). */
const QUEUE_POLICIES = {
  [QUEUES.embedItem]: 'stately',
  [QUEUES.embedSweep]: 'singleton',
  [QUEUES.pruneSearchQueries]: 'singleton',
  [QUEUES.ingest]: 'stately',
  [QUEUES.ingestSweep]: 'singleton',
  [QUEUES.pruneIngestJobs]: 'singleton',
  [QUEUES.pruneDeletedItems]: 'singleton',
  [QUEUES.mediaSweep]: 'singleton',
  [QUEUES.linkSnapshot]: 'stately',
  [QUEUES.linkCheckSweep]: 'singleton',
} as const;

/** pg-boss v10+ refuses `send` to a queue that was never created; idempotent. */
export async function ensureQueues(boss: Pick<PgBoss, 'getQueue' | 'createQueue'>): Promise<void> {
  for (const [name, policy] of Object.entries(QUEUE_POLICIES)) {
    if (!(await boss.getQueue(name))) {
      await boss.createQueue(name, { policy });
    }
  }
}
