import { WAITLIST_PENDING_RETENTION_DAYS } from '@gobbit/shared';
import type { WaitlistRepo } from '../repositories/waitlist.repo';
import { decisionLogger, type DecisionLogger } from '../lib/decision-event';
import { WAITLIST_DECISION_LEVELS, type WaitlistDecisions } from '../services/waitlist.events';

const DAY_MS = 86_400_000;

/**
 * D220: weekly delete of pending entries whose link expired more than the retention window ago,
 * and of removed entries removed longer ago than it. Their audit rows stay (D240).
 * Records `waitlist.prune` `pruned` with both counts.
 */
export function createPruneWaitlist(deps: {
  waitlist: Pick<WaitlistRepo, 'pruneExpired'>;
  now?: () => Date;
  retentionDays?: number;
  decisions?: DecisionLogger<WaitlistDecisions>;
}) {
  const {
    waitlist,
    now = () => new Date(),
    retentionDays = WAITLIST_PENDING_RETENTION_DAYS,
  } = deps;
  const decisions =
    deps.decisions ??
    decisionLogger<WaitlistDecisions>('worker', { levels: WAITLIST_DECISION_LEVELS });

  return async function pruneWaitlist(
    jobId: string,
  ): Promise<{ pendingDeleted: number; removedDeleted: number }> {
    const cutoff = new Date(now().getTime() - retentionDays * DAY_MS);
    const counts = await waitlist.pruneExpired({ pendingBefore: cutoff, removedBefore: cutoff });
    decisions.record('waitlist.prune', { outcome: 'pruned', jobId, ...counts });
    return counts;
  };
}
