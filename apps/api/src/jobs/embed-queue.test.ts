import { describe, expect, it, vi } from 'vitest';
import { createEmbedQueue, noopEmbedQueue } from './embed-queue';
import type { JobSender } from './queues';

function fakeSender(): JobSender & { send: ReturnType<typeof vi.fn> } {
  return { send: vi.fn(async () => 'job-id') };
}

function fakeEmbeddings(stale: boolean) {
  return { isStale: vi.fn(async () => stale) };
}

describe('noopEmbedQueue', () => {
  it('resolves without doing anything', async () => {
    await expect(noopEmbedQueue.enqueueIfStale('item-1')).resolves.toBeUndefined();
  });
});

describe('createEmbedQueue', () => {
  it('does not send when the item embedding is fresh', async () => {
    const sender = fakeSender();
    const embeddings = fakeEmbeddings(false);
    const queue = createEmbedQueue({ sender, embeddings, model: 'm1', log: vi.fn() });

    await queue.enqueueIfStale('item-1');

    expect(embeddings.isStale).toHaveBeenCalledWith('item-1', 'm1');
    expect(sender.send).not.toHaveBeenCalled();
  });

  it('sends an embed job with singleton key and retry options when stale', async () => {
    const sender = fakeSender();
    const embeddings = fakeEmbeddings(true);
    const queue = createEmbedQueue({ sender, embeddings, model: 'm1', log: vi.fn() });

    await queue.enqueueIfStale('item-1');

    expect(sender.send).toHaveBeenCalledTimes(1);
    expect(sender.send).toHaveBeenCalledWith(
      'embed-item',
      { itemId: 'item-1' },
      { singletonKey: 'item-1', retryLimit: 3, retryBackoff: true },
    );
  });

  it('logs and does not throw when isStale rejects', async () => {
    const sender = fakeSender();
    const embeddings = {
      isStale: vi.fn(async () => {
        throw new Error('db down');
      }),
    };
    const log = vi.fn();
    const queue = createEmbedQueue({ sender, embeddings, model: 'm1', log });

    await expect(queue.enqueueIfStale('item-1')).resolves.toBeUndefined();

    expect(sender.send).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('item-1'));
    expect(log).toHaveBeenCalledWith(expect.stringContaining('db down'));
  });

  it('logs and does not throw when send rejects', async () => {
    const sender: JobSender & { send: ReturnType<typeof vi.fn> } = {
      send: vi.fn(async () => {
        throw new Error('queue unavailable');
      }),
    };
    const log = vi.fn();
    const queue = createEmbedQueue({ sender, embeddings: fakeEmbeddings(true), model: 'm1', log });

    await expect(queue.enqueueIfStale('item-1')).resolves.toBeUndefined();

    expect(sender.send).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('queue unavailable'));
  });
});
