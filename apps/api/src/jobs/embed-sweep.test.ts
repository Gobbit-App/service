import { EMBED_SWEEP_BATCH } from '@pb/shared';
import { describe, expect, it, vi } from 'vitest';
import { createEmbedSweep } from './embed-sweep';
import { EMBED_ITEM_SEND_OPTIONS, QUEUES, type JobSender } from './queues';

function setup(ids: string[] = ['i1', 'i2']) {
  const sender = { send: vi.fn<JobSender['send']>(async () => 'job-id') };
  const embeddings = {
    findStaleIds: vi.fn<(model: string, batch: number) => Promise<string[]>>(async () => ids),
  };
  return { sender, embeddings };
}

describe('createEmbedSweep', () => {
  it('queues each stale id with its singletonKey and retry options', async () => {
    const { sender, embeddings } = setup(['a', 'b']);
    const sweep = createEmbedSweep({ sender, embeddings: embeddings as never, model: 'm1' });

    await sweep();

    expect(sender.send).toHaveBeenCalledTimes(2);
    expect(sender.send).toHaveBeenNthCalledWith(
      1,
      QUEUES.embedItem,
      { itemId: 'a' },
      { singletonKey: 'a', ...EMBED_ITEM_SEND_OPTIONS },
    );
    expect(sender.send).toHaveBeenNthCalledWith(
      2,
      QUEUES.embedItem,
      { itemId: 'b' },
      { singletonKey: 'b', ...EMBED_ITEM_SEND_OPTIONS },
    );
    expect(EMBED_ITEM_SEND_OPTIONS.retryLimit).toBe(3);
    expect(EMBED_ITEM_SEND_OPTIONS.retryBackoff).toBe(true);
  });

  it('passes model and the default batch to findStaleIds', async () => {
    const { sender, embeddings } = setup([]);
    const sweep = createEmbedSweep({ sender, embeddings: embeddings as never, model: 'm1' });

    await sweep();

    expect(embeddings.findStaleIds).toHaveBeenCalledWith('m1', EMBED_SWEEP_BATCH);
  });

  it('passes a custom batch to findStaleIds', async () => {
    const { sender, embeddings } = setup([]);
    const sweep = createEmbedSweep({
      sender,
      embeddings: embeddings as never,
      model: 'm2',
      batch: 5,
    });

    await sweep();

    expect(embeddings.findStaleIds).toHaveBeenCalledWith('m2', 5);
  });

  it('returns the number of ids it queued', async () => {
    const { sender, embeddings } = setup(['x', 'y', 'z']);
    const sweep = createEmbedSweep({ sender, embeddings: embeddings as never, model: 'm1' });

    await expect(sweep()).resolves.toBe(3);
  });

  it('returns 0 and sends nothing when there are no stale ids', async () => {
    const { sender, embeddings } = setup([]);
    const sweep = createEmbedSweep({ sender, embeddings: embeddings as never, model: 'm1' });

    await expect(sweep()).resolves.toBe(0);
    expect(sender.send).not.toHaveBeenCalled();
  });
});
