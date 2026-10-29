import { describe, expect, it, vi } from 'vitest';
import { INGEST_JOB_RETRIES, INGEST_SWEEP_STALE_MS } from '@gobbit/shared';
import { createIngestSweep } from './ingest-sweep';
import { isLastAttempt } from './ingest';

describe('ingest helpers', () => {
  it('treats attempts beyond the retry budget as the last one', () => {
    expect(isLastAttempt(1)).toBe(false);
    expect(isLastAttempt(INGEST_JOB_RETRIES)).toBe(false);
    expect(isLastAttempt(INGEST_JOB_RETRIES + 1)).toBe(true);
  });
});

describe('createIngestSweep (D93)', () => {
  it('re-enqueues stale jobs and fails the ones out of attempts', async () => {
    const now = new Date('2026-10-17T10:00:00Z');
    const jobs = {
      listStale: vi.fn(async () => [
        { id: 'fresh-try', attempts: 0 },
        { id: 'exhausted', attempts: INGEST_JOB_RETRIES + 1 },
      ]),
      setStatus: vi.fn(async () => undefined),
    };
    const queue = { enqueue: vi.fn(async () => undefined) };

    const result = await createIngestSweep({ jobs, queue, now: () => now })();

    expect(result).toEqual({ requeued: 1, failed: 1 });
    expect(jobs.listStale).toHaveBeenCalledWith(new Date(now.getTime() - INGEST_SWEEP_STALE_MS));
    expect(queue.enqueue).toHaveBeenCalledWith('fresh-try');
    expect(jobs.setStatus).toHaveBeenCalledWith('exhausted', 'failed', 'stalled', now);
  });
});
