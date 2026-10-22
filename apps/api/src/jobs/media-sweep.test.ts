import { describe, expect, it, vi } from 'vitest';
import { createMediaSweepJob } from './media-sweep';

describe('createMediaSweepJob (D158)', () => {
  it('runs the sweeper with the current time and returns its summary', async () => {
    const now = new Date('2026-03-10T06:00:00Z');
    const summary = { deleted: 2, notFound: 1, failed: 0 };
    const sweeper = { sweepOrphans: vi.fn().mockResolvedValue(summary) };

    expect(await createMediaSweepJob({ sweeper, now: () => now })()).toEqual(summary);
    expect(sweeper.sweepOrphans).toHaveBeenCalledWith({ now });
  });
});
