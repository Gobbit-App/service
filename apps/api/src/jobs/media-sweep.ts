import type { SweepSummary } from '../services/media-sweep';

/**
 * D158: the scheduled job body. The sweeper decides what is an orphan from the database and
 * logs its own summary; this only supplies the clock.
 */
export function createMediaSweepJob(deps: {
  sweeper: { sweepOrphans(input: { now: Date }): Promise<SweepSummary> };
  now?: () => Date;
}) {
  const { sweeper, now = () => new Date() } = deps;
  return async function mediaSweep(): Promise<SweepSummary> {
    return sweeper.sweepOrphans({ now: now() });
  };
}
