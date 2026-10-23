import { describe, expect, it, vi } from 'vitest';
import {
  createLinkSnapshotQueue,
  noopLinkSnapshotQueue,
  type SnapshotCandidate,
} from './link-snapshot-queue';

function candidate(o: Partial<SnapshotCandidate> = {}): SnapshotCandidate {
  return {
    id: 'i1',
    type: 'link',
    status: 'published',
    deletedAt: null,
    payload: { url: 'https://x.test/', preview: { title: 'T', image: 'https://x.test/a.jpg' } },
    ...o,
  };
}

function harness() {
  const sender = { send: vi.fn(async () => 'job-id') };
  const log = vi.fn();
  return { sender, log, queue: createLinkSnapshotQueue({ sender, log }) };
}

describe('linkSnapshotQueue.enqueueIfNeeded (D163)', () => {
  it('enqueues a live link with an image and no stored copy', async () => {
    const h = harness();
    await h.queue.enqueueIfNeeded(candidate());
    await h.queue.enqueueIfNeeded(candidate({ status: 'proposed' }));
    expect(h.sender.send).toHaveBeenCalledTimes(2);
    expect(h.sender.send).toHaveBeenCalledWith(
      'link-snapshot',
      { itemId: 'i1' },
      { singletonKey: 'i1', retryLimit: 2, retryBackoff: true },
    );
  });

  it('enqueues an empty preview so the job can fill it', async () => {
    const h = harness();
    await h.queue.enqueueIfNeeded(candidate({ payload: { url: 'https://x.test/' } }));
    await h.queue.enqueueIfNeeded(candidate({ payload: { url: 'https://x.test/', preview: {} } }));
    expect(h.sender.send).toHaveBeenCalledTimes(2);
  });

  it.each([
    [
      'already snapshotted',
      candidate({
        payload: {
          url: 'https://x.test/',
          preview: { image: 'https://x.test/a.jpg', publicId: 'gobbit/links/d/a' },
        },
      }),
    ],
    [
      'a preview without an image',
      candidate({ payload: { url: 'https://x.test/', preview: { title: 'T' } } }),
    ],
    ['not a link', candidate({ type: 'image', payload: { publicId: 'p', alt: 'a' } })],
    ['archived', candidate({ status: 'archived' })],
    ['deleted', candidate({ deletedAt: new Date() })],
  ])('skips %s', async (_label, row) => {
    const h = harness();
    await h.queue.enqueueIfNeeded(row);
    expect(h.sender.send).not.toHaveBeenCalled();
  });

  it('logs and does not throw when the send fails', async () => {
    const h = harness();
    h.sender.send.mockRejectedValueOnce(new Error('db down'));
    await expect(h.queue.enqueueIfNeeded(candidate())).resolves.toBeUndefined();
    expect(h.log).toHaveBeenCalledWith(expect.stringContaining('i1'));
  });

  it('the no-op queue (no image storage) enqueues nothing', async () => {
    await expect(noopLinkSnapshotQueue.enqueueIfNeeded(candidate())).resolves.toBeUndefined();
  });
});
