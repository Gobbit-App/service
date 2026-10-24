import type { IngestChannel } from '@pb/shared';

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
