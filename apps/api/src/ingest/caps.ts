import { INGEST_CAP_WINDOW_MS, type IngestChannel } from '@gobbit/shared';
import { rateLimited } from '../errors/http-errors';

/** Retry-After for the daily cap: the window is rolling, so an hour is a fair hint. */
const CAP_RETRY_AFTER_SECONDS = 3600;

/**
 * D190: channels outside the combined cap. Their jobs don't count toward it, and they aren't
 * held back by it, so one big import never blocks a day of normal sharing.
 */
export const OUTSIDE_COMBINED_CAP: readonly IngestChannel[] = ['import'];

export const countsTowardCombinedCap = (channel: IngestChannel): boolean =>
  !OUTSIDE_COMBINED_CAP.includes(channel);

/**
 * D110: may one more job of `channel` start? `own` = the channel's jobs in the window,
 * `combined` = jobs of the channels inside the combined cap (null when it doesn't apply).
 */
export function withinCaps(input: {
  channel: IngestChannel;
  own: number;
  combined: number | null;
  dailyCaps: Record<IngestChannel, number>;
  combinedCap: number;
}): boolean {
  if (input.own >= input.dailyCaps[input.channel]) return false;
  return input.combined === null || input.combined < input.combinedCap;
}

/** The repo calls `createCapGuard` needs. */
export interface CapCounts {
  countByUserSince(
    userId: string,
    since: Date,
    channel?: IngestChannel,
    exclude?: readonly IngestChannel[],
  ): Promise<number>;
}

/**
 * D110/D197: throws 429 when one more job of `channel` (a new share or a retry) would pass the
 * channel's cap or the combined ceiling over the rolling window.
 */
export function createCapGuard(deps: {
  jobs: CapCounts;
  dailyCaps: Record<IngestChannel, number>;
  combinedCap: number;
  now: () => Date;
}) {
  return async function assertWithinCaps(userId: string, channel: IngestChannel): Promise<void> {
    const since = new Date(deps.now().getTime() - INGEST_CAP_WINDOW_MS);
    const [own, combined] = await Promise.all([
      deps.jobs.countByUserSince(userId, since, channel),
      countsTowardCombinedCap(channel)
        ? deps.jobs.countByUserSince(userId, since, undefined, OUTSIDE_COMBINED_CAP)
        : null,
    ]);
    const ok = withinCaps({
      channel,
      own,
      combined,
      dailyCaps: deps.dailyCaps,
      combinedCap: deps.combinedCap,
    });
    if (!ok) throw rateLimited(CAP_RETRY_AFTER_SECONDS);
  };
}
