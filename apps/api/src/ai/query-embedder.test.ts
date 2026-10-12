import { describe, expect, it, vi } from 'vitest';
import type { Embedder } from './embedder';
import type { LlmCallSink } from './llm-calls';
import { createQueryEmbedder, queryCacheKey } from './query-embedder';

type Row = Parameters<LlmCallSink['insert']>[0];

const ctx = { userId: 'user-1', deckId: 'deck-1' };
const VECTOR = [0.1, 0.2, 0.3];

function setup(
  embedImpl?: (texts: string[]) => Promise<{ vectors: number[][]; inputTokens: number }>,
) {
  const rows: Row[] = [];
  const llmCalls: LlmCallSink = {
    insert: async (row) => {
      rows.push(row);
    },
  };
  const embed = vi.fn(
    embedImpl ??
      (async (texts: string[]) => ({ vectors: texts.map(() => VECTOR), inputTokens: 5 })),
  );
  const embedder: Embedder = { provider: 'fake', model: 'fake-embedding', dims: 3, embed };
  const withinBudget = vi.fn(async (_userId: string) => true);
  const log = vi.fn();
  const query = createQueryEmbedder({ embedder, llmCalls, withinBudget, log });
  return { query, embed, rows, withinBudget, log };
}

describe('queryCacheKey', () => {
  it('joins model and query with a NUL separator', () => {
    expect(queryCacheKey('m', 'q')).toBe('m\u0000q');
    expect(queryCacheKey('m1', 'q')).not.toBe(queryCacheKey('m2', 'q'));
  });
});

describe('createQueryEmbedder', () => {
  it('embeds on a miss and records one embed_query row', async () => {
    const { query, embed, rows, withinBudget } = setup();

    const vector = await query.embed('hello', ctx);

    expect(vector).toEqual(VECTOR);
    expect(withinBudget).toHaveBeenCalledWith('user-1');
    expect(embed).toHaveBeenCalledTimes(1);
    expect(embed).toHaveBeenCalledWith(['hello']);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      purpose: 'embed_query',
      provider: 'fake',
      model: 'fake-embedding',
      userId: 'user-1',
      deckId: 'deck-1',
      status: 'ok',
    });
  });

  it('serves the second identical query from cache without budget, embed, or row', async () => {
    const { query, embed, rows, withinBudget } = setup();

    await query.embed('hello', ctx);
    const again = await query.embed('hello', ctx);

    expect(again).toEqual(VECTOR);
    expect(embed).toHaveBeenCalledTimes(1);
    expect(withinBudget).toHaveBeenCalledTimes(1);
    expect(rows).toHaveLength(1);
  });

  it('returns null without embedding when over budget', async () => {
    const { query, embed, rows, withinBudget } = setup();
    withinBudget.mockResolvedValueOnce(false);

    const result = await query.embed('hello', ctx);

    expect(result).toBeNull();
    expect(embed).not.toHaveBeenCalled();
    expect(rows).toHaveLength(0);
  });

  it('returns null, logs, and records an error row when the provider fails', async () => {
    const { query, rows, log } = setup(async () => {
      throw new Error('boom');
    });

    const result = await query.embed('hello', ctx);

    expect(result).toBeNull();
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]?.[0]).toContain('boom');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'error', error: 'boom', userId: 'user-1' });
  });
});
