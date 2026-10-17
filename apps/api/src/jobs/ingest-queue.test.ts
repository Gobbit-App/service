import { describe, expect, it, vi } from 'vitest';
import { createIngestQueue, noopIngestQueue } from './ingest-queue';
import { INGEST_SEND_OPTIONS, QUEUES } from './queues';

describe('noopIngestQueue', () => {
  it('resolves without doing anything', async () => {
    await expect(noopIngestQueue.enqueue('job-1')).resolves.toBeUndefined();
  });
});

describe('createIngestQueue', () => {
  it('sends the job id to the ingest queue with a singleton key and retries', async () => {
    const send = vi.fn(async () => 'boss-id');
    const queue = createIngestQueue({ sender: { send } });

    await queue.enqueue('job-1');

    expect(send).toHaveBeenCalledWith(
      QUEUES.ingest,
      { jobId: 'job-1' },
      { singletonKey: 'job-1', ...INGEST_SEND_OPTIONS },
    );
  });

  it('logs and swallows a send failure', async () => {
    const send = vi.fn(async () => {
      throw new Error('boss down');
    });
    const log = vi.fn();
    const queue = createIngestQueue({ sender: { send }, log });

    await expect(queue.enqueue('job-2')).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('job-2'));
    expect(log).toHaveBeenCalledWith(expect.stringContaining('boss down'));
  });
});
