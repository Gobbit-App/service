import { beforeAll, describe, expect, it } from 'vitest';
import type { DeckRow, ItemRow } from '@pb/db';
import { createDeck, createItem } from '@pb/db/test';
import { createFakeEmbedder } from '../src/ai/fake-embedder';
import { createEmbedItemHandler } from '../src/jobs/embed-item';
import { createEmbedSweep } from '../src/jobs/embed-sweep';
import { QUEUES } from '../src/jobs/queues';
import { createEmbeddingsRepo } from '../src/repositories/embeddings.repo';
import { createLlmCallsRepo } from '../src/repositories/llm-calls.repo';
import { setupApiTest } from './helpers';

describe('embedding jobs (P4.1, D72/D74)', () => {
  const embedder = createFakeEmbedder();
  const enqueued: string[] = [];
  const ctx = setupApiTest({
    search: {
      embedder,
      embedQueue: {
        enqueueIfStale: async (id: string) => {
          enqueued.push(id);
        },
      },
    },
  });
  let deck: DeckRow;
  let item: ItemRow;

  const embeddings = () => createEmbeddingsRepo(ctx.t.db);
  const handler = () =>
    createEmbedItemHandler({
      embedder,
      embeddings: embeddings(),
      llmCalls: createLlmCallsRepo(ctx.t.db),
    });
  const updatedAt = async (id: string): Promise<Date> =>
    (await ctx.t.pool.query('select updated_at from items where id = $1', [id])).rows[0].updated_at;

  beforeAll(async () => {
    deck = await createDeck(ctx.t.db, ctx.world.owner);
    item = await createItem(ctx.t.db, deck, {
      card: { type: 'text', title: 'Recycling', body: 'Blue bin on Thursdays' },
    });
  });

  it('a new item is stale, embeds once, then is fresh', async () => {
    expect(await embeddings().isStale(item.id, embedder.model)).toBe(true);
    expect(await handler()(item.id)).toBe('embedded');
    expect(await embeddings().isStale(item.id, embedder.model)).toBe(false);
    expect(await handler()(item.id)).toBe('fresh');
  });

  it('storing a vector does not bump updated_at', async () => {
    const other = await createItem(ctx.t.db, deck, {
      card: { type: 'text', title: 'Compost', body: 'Green bin' },
    });
    const before = await updatedAt(other.id);
    expect(await handler()(other.id)).toBe('embedded');
    expect((await updatedAt(other.id)).getTime()).toBe(before.getTime());
  });

  it('a vector for a different model counts as stale', async () => {
    expect(await embeddings().isStale(item.id, 'another-model')).toBe(true);
  });

  it('a save racing an edit is superseded', async () => {
    const repo = embeddings();
    const target = await repo.loadForEmbedding(item.id, 'race-model');
    await ctx.t.pool.query(`update items set body = 'Blue bin on Fridays' where id = $1`, [
      item.id,
    ]);
    const saved = await repo.saveEmbedding(item.id, {
      vector: (await embedder.embed(['x'])).vectors[0]!,
      model: 'race-model',
      hash: target!.hash,
    });
    expect(saved).toBe(false);
  });

  it('editing an item through the API enqueues it', async () => {
    const res = await ctx.app.request(`/items/${item.id}`, {
      method: 'PATCH',
      headers: ctx.as(),
      body: JSON.stringify({ title: 'Recycling day' }),
    });
    expect(res.status).toBe(200);
    expect(enqueued).toContain(item.id);
  });

  it('the sweep queues stale items with a singleton key', async () => {
    const sent: { name: string; data: unknown; options: Record<string, unknown> }[] = [];
    const sweep = createEmbedSweep({
      sender: {
        send: async (name: string, data: object, options: object) => {
          sent.push({ name, data, options: options as Record<string, unknown> });
          return null;
        },
      } as never,
      embeddings: embeddings(),
      model: embedder.model,
      batch: 1000,
    });
    expect(await sweep()).toBeGreaterThan(0);
    const mine = sent.find((s) => (s.data as { itemId: string }).itemId === item.id);
    expect(mine).toMatchObject({ name: QUEUES.embedItem, options: { singletonKey: item.id } });
  });
});
