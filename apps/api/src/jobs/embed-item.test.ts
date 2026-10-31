import { describe, expect, it, vi } from 'vitest';
import type { NewLlmCallRow } from '@gobbit/db';
import type { Embedder, EmbedResult } from '../ai/embedder';
import type { LlmCallSink } from '../ai/llm-calls';
import type { EmbeddingTarget, EmbeddingsRepo } from '../repositories/embeddings.repo';
import { createEmbedItemHandler } from './embed-item';

const target: EmbeddingTarget = {
  id: 'item-1',
  deckId: 'deck-1',
  searchText: 'search text',
  hash: 'h1',
  stale: true,
};

function build(opts: {
  loaded?: EmbeddingTarget | null;
  saved?: boolean;
  embedResult?: EmbedResult;
}) {
  const rows: NewLlmCallRow[] = [];
  const llmCalls: LlmCallSink = {
    insert: vi.fn(async (r: NewLlmCallRow) => {
      rows.push(r);
    }),
  };
  const embed = vi.fn(
    async (_texts: string[], _opts?: { signal?: AbortSignal }): Promise<EmbedResult> =>
      opts.embedResult ?? { vectors: [[1, 2, 3]], inputTokens: 5 },
  );
  const embedder: Embedder = { provider: 'fake', model: 'm', dims: 3, embed };
  const loadForEmbedding = vi.fn(
    async (_id: string, _model: string): Promise<EmbeddingTarget | null> =>
      opts.loaded === undefined ? target : opts.loaded,
  );
  const saveEmbedding = vi.fn(
    async (_id: string, _v: { vector: number[]; model: string; hash: string }) =>
      opts.saved ?? true,
  );
  const embeddings: Pick<EmbeddingsRepo, 'loadForEmbedding' | 'saveEmbedding'> = {
    loadForEmbedding,
    saveEmbedding,
  };
  const handler = createEmbedItemHandler({ embedder, embeddings, llmCalls });
  return { handler, embed, saveEmbedding, rows };
}

describe('createEmbedItemHandler', () => {
  it('returns missing and does not embed when the item is absent', async () => {
    const { handler, embed, rows } = build({ loaded: null });
    await expect(handler('item-1')).resolves.toBe('missing');
    expect(embed).not.toHaveBeenCalled();
    expect(rows).toHaveLength(0);
  });

  it('returns fresh and does not embed when the stored vector is current', async () => {
    const { handler, embed, rows } = build({ loaded: { ...target, stale: false } });
    await expect(handler('item-1')).resolves.toBe('fresh');
    expect(embed).not.toHaveBeenCalled();
    expect(rows).toHaveLength(0);
  });

  it('embeds stale items, forwards job id and signal, and saves the vector', async () => {
    const { handler, embed, saveEmbedding, rows } = build({});
    const controller = new AbortController();

    const outcome = await handler('item-1', { id: 'job-1', signal: controller.signal });

    expect(outcome).toBe('embedded');
    expect(embed).toHaveBeenCalledWith(['search text'], { signal: controller.signal });
    expect(saveEmbedding).toHaveBeenCalledWith('item-1', {
      vector: [1, 2, 3],
      model: 'm',
      hash: 'h1',
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      purpose: 'embed_item',
      itemId: 'item-1',
      deckId: 'deck-1',
      jobId: 'job-1',
      status: 'ok',
    });
  });

  it('returns superseded when the save is a no-op', async () => {
    const { handler } = build({ saved: false });
    await expect(handler('item-1')).resolves.toBe('superseded');
  });

  it('rejects and records an error row when the embedder throws', async () => {
    const { handler, embed, saveEmbedding, rows } = build({});
    embed.mockRejectedValueOnce(new Error('provider down'));

    await expect(handler('item-1')).rejects.toThrow('provider down');
    expect(saveEmbedding).not.toHaveBeenCalled();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'error', error: 'provider down' });
  });

  it('rejects when the embedder returns no vector', async () => {
    const { handler, saveEmbedding } = build({ embedResult: { vectors: [], inputTokens: 0 } });

    await expect(handler('item-1')).rejects.toThrow(/no vector/);
    expect(saveEmbedding).not.toHaveBeenCalled();
  });
});
