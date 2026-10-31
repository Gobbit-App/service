import { WAITLIST_PENDING_RETENTION_DAYS } from '@gobbit/shared';
import { describe, expect, it, vi } from 'vitest';
import { captureLogger, expectDecision } from '../../test/capture-logger';
import { decisionLogger } from '../lib/decision-event';
import type { WaitlistDecisions } from '../services/waitlist.events';
import { createPruneWaitlist } from './prune-waitlist';

const DAY_MS = 86_400_000;
const NOW = new Date('2026-10-25T06:00:00.000Z');

function setup(counts = { pendingDeleted: 0, removedDeleted: 0 }) {
  const capture = captureLogger();
  const waitlist = {
    pruneExpired: vi.fn(async (_r: { pendingBefore: Date; removedBefore: Date }) => counts),
  };
  const prune = createPruneWaitlist({
    waitlist,
    now: () => NOW,
    decisions: decisionLogger<WaitlistDecisions>('worker', { parent: capture.logger }),
  });
  return { ...capture, waitlist, prune };
}

describe('createPruneWaitlist (D220)', () => {
  it('cuts off at now minus the 30-day retention for both expiry and removal', async () => {
    const { waitlist, prune } = setup();
    await prune('job-1');

    expect(WAITLIST_PENDING_RETENTION_DAYS).toBe(30);
    const cutoff = NOW.getTime() - 30 * DAY_MS;
    const arg = waitlist.pruneExpired.mock.calls[0]?.[0] as unknown as {
      pendingBefore: Date;
      removedBefore: Date;
    };
    expect(arg.pendingBefore.getTime()).toBe(cutoff);
    expect(arg.removedBefore.getTime()).toBe(cutoff);
  });

  it('returns the counts and records waitlist.prune with the job id', async () => {
    const { prune, lines, flush } = setup({ pendingDeleted: 2, removedDeleted: 1 });
    expect(await prune('job-7')).toEqual({ pendingDeleted: 2, removedDeleted: 1 });

    await flush();
    expect(expectDecision(lines, 'waitlist.prune', { outcome: 'pruned' })).toMatchObject({
      jobId: 'job-7',
      pendingDeleted: 2,
      removedDeleted: 1,
      level: 'info',
    });
  });
});
