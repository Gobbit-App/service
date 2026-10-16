import type { NewLlmCallRow } from '@pb/db';
import { describe, expect, it, vi } from 'vitest';
import {
  type LlmCallContext,
  type LlmCallSink,
  formatCostUsd,
  llmCostUsd,
  recordLlmCall,
} from './llm-calls';
import { OPENROUTER_DEFAULT_ASK_MODEL } from './providers';

const ctx: LlmCallContext = {
  purpose: 'ask',
  provider: 'anthropic',
  model: 'claude-haiku-5-5',
  deckId: 'deck-1',
  userId: 'user-1',
};

function memorySink(): LlmCallSink & { insert: ReturnType<typeof vi.fn> } {
  const insert = vi.fn(async (_row: NewLlmCallRow) => {});
  return { insert };
}

function clock(...times: number[]): () => number {
  const fn = vi.fn();
  for (const t of times) fn.mockReturnValueOnce(t);
  return fn as unknown as () => number;
}

describe('llmCostUsd', () => {
  it('prices known models per 1M tokens', () => {
    expect(llmCostUsd('text-embedding-3-small', 1_000_000, 0)).toBeCloseTo(0.02, 10);
    expect(llmCostUsd('claude-haiku-5-5', 1_000_000, 1_000_000)).toBeCloseTo(0.6, 10);
  });

  it('prices the OpenRouter id of the default Ask model like the direct one', () => {
    expect(llmCostUsd(OPENROUTER_DEFAULT_ASK_MODEL, 2_000, 300)).toBeCloseTo(
      llmCostUsd('claude-haiku-5-5', 2_000, 300),
      12,
    );
    expect(llmCostUsd(OPENROUTER_DEFAULT_ASK_MODEL, 2_000, 300)).toBeGreaterThan(0);
  });

  it('costs unknown models at 0', () => {
    expect(llmCostUsd('mystery-model', 5_000_000, 5_000_000)).toBe(0);
  });
});

describe('formatCostUsd', () => {
  it('formats with 6 decimal places', () => {
    expect(formatCostUsd(0.02)).toBe('0.020000');
    expect(formatCostUsd(0)).toBe('0.000000');
  });
});

describe('recordLlmCall', () => {
  it('inserts one ok row with tokens, cost and latency on success', async () => {
    const sink = memorySink();
    const result = await recordLlmCall(
      sink,
      ctx,
      async () => ({ inputTokens: 1000, outputTokens: 500 }),
      { now: clock(1000, 1250), log: vi.fn() },
    );

    expect(result).toEqual({ inputTokens: 1000, outputTokens: 500 });
    expect(sink.insert).toHaveBeenCalledTimes(1);
    const row = sink.insert.mock.calls[0]![0] as NewLlmCallRow;
    expect(row).toMatchObject({
      purpose: 'ask',
      provider: 'anthropic',
      model: 'claude-haiku-5-5',
      deckId: 'deck-1',
      userId: 'user-1',
      status: 'ok',
      inputTokens: 1000,
      outputTokens: 500,
      costUsd: '0.000350',
      latencyMs: 250,
      error: null,
    });
  });

  it('inserts an error row, truncates the message, and rethrows the original error', async () => {
    const sink = memorySink();
    const log = vi.fn();
    const original = new Error('x'.repeat(600));

    await expect(
      recordLlmCall(
        sink,
        ctx,
        async () => {
          throw original;
        },
        { now: clock(0, 40), log },
      ),
    ).rejects.toBe(original);

    expect(sink.insert).toHaveBeenCalledTimes(1);
    const row = sink.insert.mock.calls[0]![0] as NewLlmCallRow;
    expect(row).toMatchObject({
      status: 'error',
      inputTokens: 0,
      outputTokens: 0,
      costUsd: '0.000000',
      latencyMs: 40,
    });
    expect(row.error).toHaveLength(500);
    expect(row.error).toBe('x'.repeat(500));
  });

  it('logs a failing insert on success without masking the result', async () => {
    const sink: LlmCallSink = { insert: vi.fn().mockRejectedValue(new Error('db down')) };
    const log = vi.fn();

    const result = await recordLlmCall(
      sink,
      ctx,
      async () => ({ inputTokens: 1, outputTokens: 1 }),
      {
        now: clock(0, 1),
        log,
      },
    );

    expect(result).toEqual({ inputTokens: 1, outputTokens: 1 });
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]![0]).toContain('db down');
  });

  it('logs a failing insert on error and still rethrows the original error', async () => {
    const sink: LlmCallSink = { insert: vi.fn().mockRejectedValue(new Error('db down')) };
    const log = vi.fn();
    const original = new Error('provider exploded');

    await expect(
      recordLlmCall(
        sink,
        ctx,
        async () => {
          throw original;
        },
        { now: clock(0, 5), log },
      ),
    ).rejects.toBe(original);

    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]![0]).toContain('db down');
  });
});
