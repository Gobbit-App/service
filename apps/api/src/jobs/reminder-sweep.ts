import { REMINDER_SWEEP_CRON } from '@gobbit/shared';
import type { Job } from 'pg-boss';
import { QUEUES } from './queues';

/** The pg-boss surface the schedule needs. */
export interface ReminderSweepScheduler {
  schedule(name: string, cron: string): Promise<void>;
  work(name: string, handler: (jobs: Job[]) => Promise<void>): Promise<unknown>;
}

/**
 * D295: the minute `reminder-sweep` (singleton queue: one tick at a time). A failed tick is
 * picked up by the next one; claims and the unique delivery key keep sends at most once.
 */
export async function scheduleReminderSweep(
  boss: ReminderSweepScheduler,
  notify: { tick(jobId: string): Promise<unknown> },
): Promise<void> {
  await boss.schedule(QUEUES.reminderSweep, REMINDER_SWEEP_CRON);
  await boss.work(QUEUES.reminderSweep, async ([job]: Job[]) => {
    await notify.tick(job?.id ?? 'unknown');
  });
}
