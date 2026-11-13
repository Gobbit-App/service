import type { SweepSummary, VerifySummary } from '../services/media-sweep';

/**
 * D158/D390: the scheduled job body. The sweeper decides what is an orphan from the database,
 * then checks recent uploads' facts against the provider; both log their own events. This only
 * supplies the clock and the job id.
 */
export function createMediaSweepJob(deps: {
  sweeper: {
    sweepOrphans(input: { now: Date; jobId?: string }): Promise<SweepSummary>;
    verifyRecent?(input: { now: Date; jobId?: string }): Promise<VerifySummary>;
  };
  now?: () => Date;
}) {
  const { sweeper, now = () => new Date() } = deps;
  return async function mediaSweep(
    jobId?: string,
  ): Promise<SweepSummary & { verify?: VerifySummary }> {
    const swept = await sweeper.sweepOrphans({ now: now(), jobId });
    const verify = await sweeper.verifyRecent?.({ now: now(), jobId });
    return verify ? { ...swept, verify } : swept;
  };
}
