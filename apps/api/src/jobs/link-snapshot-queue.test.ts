import { describe, expect, it, vi } from 'vitest';
import { LINK_IMAGE_CANDIDATES_MAX } from '@gobbit/shared';
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
      'a text-only preview already looked at (D350)',
      candidate({ payload: { url: 'https://x.test/', preview: { title: 'T', imageLookup: 1 } } }),
    ],
    [
      'a preview whose photo a member removed (D350)',
      candidate({
        payload: { url: 'https://x.test/', preview: { title: 'T', imageRemoved: true } },
      }),
    ],
    ['not a link', candidate({ type: 'image', payload: { publicId: 'p', alt: 'a' } })],
    ['archived', candidate({ status: 'archived' })],
    ['deleted', candidate({ deletedAt: new Date() })],
  ])('skips %s', async (_label, row) => {
    const h = harness();
    await h.queue.enqueueIfNeeded(row);
    expect(h.sender.send).not.toHaveBeenCalled();
  });

  it('enqueues a text-only preview not yet looked at under the current rules (D350)', async () => {
    const h = harness();
    await h.queue.enqueueIfNeeded(
      candidate({ payload: { url: 'https://x.test/', preview: { description: 'D' } } }),
    );
    expect(h.sender.send).toHaveBeenCalledTimes(1);
  });

  it('hands the ingest image candidates to the job, capped (D349)', async () => {
    const h = harness();
    const urls = Array.from({ length: 9 }, (_, i) => `https://x.test/${i}.jpg`);
    await h.queue.enqueueIfNeeded(candidate(), { candidates: urls });
    await h.queue.enqueueIfNeeded(candidate(), { candidates: [] });
    const [, first] = h.sender.send.mock.calls[0] as unknown as [string, { candidates: string[] }];
    expect(first.candidates).toEqual(urls.slice(0, LINK_IMAGE_CANDIDATES_MAX));
    expect((h.sender.send.mock.calls[1] as unknown as unknown[])[1]).toEqual({ itemId: 'i1' });
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
