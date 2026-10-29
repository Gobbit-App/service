import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { items, llmCalls, type DeckRow, type ItemRow } from '@gobbit/db';
import { createDeck, createItem } from '@gobbit/db/test';
import { EMBEDDING_DIMS } from '@gobbit/shared';
import type { Embedder } from '../src/ai/embedder';
import { axisVector, blendVectors } from '../src/ai/fake-embedder';
import { runDedup } from '../src/ingest/run-dedup';
import { createDedupRepo } from '../src/repositories/dedup.repo';
import { createEmbeddingsRepo } from '../src/repositories/embeddings.repo';
import { createLlmCallsRepo } from '../src/repositories/llm-calls.repo';
import { setupApiTest } from './helpers';

const MODEL = 'fake-embedding';
const axis = (i: number) => axisVector(EMBEDDING_DIMS, i);
/** Unit vector whose cosine similarity with `axis(0)` is exactly `sim`. */
const near = (sim: number) =>
  blendVectors([
    { vector: axis(0), weight: sim },
    { vector: axis(1), weight: Math.sqrt(1 - sim * sim) },
  ]);

/** Returns `vector` for every text (the draft's meaning is fixed by the test). */
function fixedEmbedder(vector: number[] | Error): Embedder & { calls: number } {
  const e = {
    provider: 'fake',
    model: MODEL,
    dims: EMBEDDING_DIMS,
    calls: 0,
    async embed(texts: string[]) {
      e.calls += 1;
      if (vector instanceof Error) throw vector;
      return { vectors: texts.map(() => [...vector]), inputTokens: 1 };
    },
  };
  return e;
}

describe('dedup (D103)', () => {
  const ctx = setupApiTest();
  let deck: DeckRow;
  let existing: ItemRow;

  const embeddings = () => createEmbeddingsRepo(ctx.t.db);

  async function storeVector(itemId: string, vector: number[]) {
    const target = await embeddings().loadForEmbedding(itemId, MODEL);
    await embeddings().saveEmbedding(itemId, { vector, model: MODEL, hash: target!.hash });
  }

  async function draft(card: Record<string, unknown>): Promise<ItemRow> {
    return createItem(ctx.t.db, deck, {
      card: card as never,
      status: 'proposed',
      verifiedAt: null,
    });
  }

  function dedup(item: ItemRow, embedder: Embedder | null) {
    return runDedup(
      {
        dedup: createDedupRepo(ctx.t.db),
        embedder,
        embeddings: embeddings(),
        llmCalls: createLlmCallsRepo(ctx.t.db),
        log: () => undefined,
      },
      {
        itemId: item.id,
        deckId: deck.id,
        title: item.title,
        sourceUrl: item.sourceUrl,
        jobId: '00000000-0000-4000-8000-0000000000aa',
        userId: ctx.world.owner.id,
      },
    );
  }

  // A fresh deck per test: drafts from one case must not become candidates in the next.
  beforeEach(async () => {
    deck = await createDeck(ctx.t.db, ctx.world.owner);
    existing = await createItem(ctx.t.db, deck, {
      card: {
        type: 'link',
        title: 'Dan the Plumber',
        body: 'Fixes leaks, 050-123-4567',
        payload: { url: 'https://dan.example/plumber?utm_source=wa' },
      },
    });
    await storeVector(existing.id, axis(0));
  });

  it('marks a near-identical draft as an update and stores the draft vector', async () => {
    const item = await draft({ type: 'text', title: 'Plumber Dan', body: 'Leaks, 050-1234567' });
    const verdict = await dedup(item, fixedEmbedder(near(0.95)));

    expect(verdict).toMatchObject({ action: 'update', itemId: existing.id, via: 'vector' });
    expect(verdict.similarity).toBeCloseTo(0.95, 3);
    expect(await embeddings().isStale(item.id, MODEL)).toBe(false);
    const calls = await ctx.t.db.select().from(llmCalls).where(eq(llmCalls.itemId, item.id));
    expect(calls).toEqual([expect.objectContaining({ purpose: 'embed_draft', status: 'ok' })]);
  });

  it('flags 0.80–0.92 as a possible duplicate and lower as new', async () => {
    const possible = await draft({ type: 'text', title: 'A plumber', body: 'Someone for leaks' });
    expect(await dedup(possible, fixedEmbedder(near(0.85)))).toMatchObject({
      action: 'possible_duplicate',
      itemId: existing.id,
      via: 'vector',
    });

    const fresh = await draft({ type: 'text', title: 'Recycling', body: 'Blue bin Thursday' });
    const verdict = await dedup(fresh, fixedEmbedder(axis(7)));
    expect(verdict).toMatchObject({ action: 'new', itemId: null, via: 'none' });
  });

  it('an identical normalized source_url beats the vector', async () => {
    const item = await draft({
      type: 'link',
      title: 'Totally different words',
      body: '',
      payload: { url: 'https://dan.example/plumber/#top' },
    });
    expect(await dedup(item, fixedEmbedder(axis(9)))).toMatchObject({
      action: 'update',
      itemId: existing.id,
      via: 'source_url',
      similarity: null,
    });
  });

  it('ignores deleted items and the draft itself', async () => {
    const gone = await createItem(ctx.t.db, deck, {
      card: { type: 'text', title: 'Gone', body: 'deleted card' },
    });
    await storeVector(gone.id, axis(20));
    await ctx.t.db.update(items).set({ deletedAt: new Date() }).where(eq(items.id, gone.id));

    const item = await draft({ type: 'text', title: 'Gone again', body: 'same meaning' });
    const verdict = await dedup(item, fixedEmbedder(axis(20)));
    expect(verdict.action).toBe('new');
    expect(verdict.itemId).toBeNull();
  });

  it('without an embedder falls back to title similarity (possible duplicate only)', async () => {
    const item = await draft({ type: 'text', title: 'Dan the Plumber', body: 'Other text' });
    expect(await dedup(item, null)).toMatchObject({
      action: 'possible_duplicate',
      itemId: existing.id,
      via: 'title',
    });
  });

  it('an embedding failure degrades to the keyless path instead of throwing', async () => {
    const item = await draft({ type: 'text', title: 'Dan the Plumber!', body: 'x' });
    const verdict = await dedup(item, fixedEmbedder(new Error('provider down')));
    expect(verdict).toMatchObject({ action: 'possible_duplicate', via: 'title' });
    expect(await embeddings().isStale(item.id, MODEL)).toBe(true);
  });
});
