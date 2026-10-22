import { LINK_CHECK_CRON } from '@pb/shared';
import type { SweepSummary } from '../services/link-checks.service';
import { QUEUES } from './queues';

/** The pg-boss surface the schedule needs. */
export interface LinkCheckScheduler {
  schedule(name: string, cron: string): Promise<void>;
  work(name: string, handler: () => Promise<void>): Promise<unknown>;
}

/**
 * D164: the daily `link-check-sweep` (always on; it needs no image storage). The service logs
 * its own summary; a failed run is retried by the next day's schedule.
 */
export async function scheduleLinkCheckSweep(
  boss: LinkCheckScheduler,
  checker: { sweep(): Promise<SweepSummary> },
): Promise<void> {
  await boss.schedule(QUEUES.linkCheckSweep, LINK_CHECK_CRON);
  await boss.work(QUEUES.linkCheckSweep, async () => {
    await checker.sweep();
  });
}
