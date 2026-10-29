import { SEARCH_QUERY_RETENTION_DAYS } from '@gobbit/shared';
import { describe, expect, it, vi } from 'vitest';
import { createPruneSearchQueries } from './prune-search-queries';

const DAY_MS = 86_400_000;

describe('createPruneSearchQueries', () => {
  it('passes a cutoff of now minus retentionDays days', async () => {
    const pruneBefore = vi.fn<(cutoff: Date) => Promise<number>>(async () => 0);
    const now = new Date('2026-10-12T12:00:00.000Z');

    const prune = createPruneSearchQueries({
      searchQueries: { pruneBefore },
      now: () => now,
      retentionDays: 30,
    });
    await prune();

    expect(pruneBefore).toHaveBeenCalledTimes(1);
    const cutoff = pruneBefore.mock.calls[0]?.[0] as Date;
    expect(cutoff.getTime()).toBe(now.getTime() - 30 * DAY_MS);
  });

  it('uses SEARCH_QUERY_RETENTION_DAYS from @gobbit/shared by default', async () => {
    const pruneBefore = vi.fn<(cutoff: Date) => Promise<number>>(async () => 0);
    const now = new Date('2026-10-12T00:00:00.000Z');

    const prune = createPruneSearchQueries({
      searchQueries: { pruneBefore },
      now: () => now,
    });
    await prune();

    const cutoff = pruneBefore.mock.calls[0]?.[0] as Date;
    expect(cutoff.getTime()).toBe(now.getTime() - SEARCH_QUERY_RETENTION_DAYS * DAY_MS);
  });

  it('returns the count reported by the repo', async () => {
    const pruneBefore = vi.fn<(cutoff: Date) => Promise<number>>(async () => 7);

    const prune = createPruneSearchQueries({
      searchQueries: { pruneBefore },
      now: () => new Date('2026-10-12T00:00:00.000Z'),
      retentionDays: 1,
    });

    await expect(prune()).resolves.toBe(7);
  });

  it('returns zero when the repo removes nothing', async () => {
    const pruneBefore = vi.fn<(cutoff: Date) => Promise<number>>(async () => 0);

    const prune = createPruneSearchQueries({
      searchQueries: { pruneBefore },
      now: () => new Date('2026-10-12T00:00:00.000Z'),
      retentionDays: 90,
    });

    await expect(prune()).resolves.toBe(0);
    expect(pruneBefore).toHaveBeenCalledTimes(1);
  });
});
