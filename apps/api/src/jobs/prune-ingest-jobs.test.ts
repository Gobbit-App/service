import { INGEST_RAW_RETENTION_DAYS } from '@pb/shared';
import { describe, expect, it, vi } from 'vitest';
import { createPruneIngestJobs } from './prune-ingest-jobs';

const DAY_MS = 86_400_000;
const NOW = new Date('2026-10-17T04:00:00.000Z');

function repo(result = { pruned: 0, withUploads: [] as string[] }) {
  return { pruneBefore: vi.fn(async (_cutoff: Date) => result) };
}

describe('createPruneIngestJobs', () => {
  it('passes a cutoff of now minus the retention window (default 30 days)', async () => {
    const jobs = repo();
    await createPruneIngestJobs({ jobs, uploads: null, now: () => NOW })();
    const cutoff = jobs.pruneBefore.mock.calls[0]?.[0] as Date;
    expect(cutoff.getTime()).toBe(NOW.getTime() - INGEST_RAW_RETENTION_DAYS * DAY_MS);
  });

  it('deletes uploads for the returned jobs and counts them', async () => {
    const jobs = repo({ pruned: 4, withUploads: ['j1', 'j2'] });
    const deleteForJob = vi.fn(async () => undefined);
    const result = await createPruneIngestJobs({
      jobs,
      uploads: { deleteForJob },
      now: () => NOW,
    })();
    expect(deleteForJob.mock.calls).toEqual([['j1'], ['j2']]);
    expect(result).toEqual({ pruned: 4, uploadsDeleted: 2 });
  });

  it('logs and skips a failed upload deletion', async () => {
    const jobs = repo({ pruned: 2, withUploads: ['bad', 'ok'] });
    const deleteForJob = vi.fn(async (id: string) => {
      if (id === 'bad') throw new Error('cloudinary down');
    });
    const log = vi.fn();
    const result = await createPruneIngestJobs({
      jobs,
      uploads: { deleteForJob },
      now: () => NOW,
      log,
    })();
    expect(result).toEqual({ pruned: 2, uploadsDeleted: 1 });
    expect(log).toHaveBeenCalledWith(expect.stringContaining('cloudinary down'));
  });

  it('only nulls rows when no upload store is configured', async () => {
    const jobs = repo({ pruned: 3, withUploads: ['j1'] });
    const result = await createPruneIngestJobs({
      jobs,
      uploads: null,
      now: () => NOW,
      retentionDays: 7,
    })();
    expect(result).toEqual({ pruned: 3, uploadsDeleted: 0 });
    const cutoff = jobs.pruneBefore.mock.calls[0]?.[0] as Date;
    expect(cutoff.getTime()).toBe(NOW.getTime() - 7 * DAY_MS);
  });
});
