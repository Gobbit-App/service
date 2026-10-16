import { describe, expect, it } from 'vitest';
import type { NewLlmCallRow } from '@pb/db';
import type { NormalizedSource } from '@pb/shared';
import { createFakeExtractor } from '../ai/fake-extractor';
import { ExtractResponseError, type Extractor } from '../ai/extractor';
import { runExtraction, type RunExtractionInput } from './run-extraction';

const C1 = '00000000-0000-4000-8000-000000000001';

const source: NormalizedSource = {
  text: 'Dan the plumber, call 050-1234567',
  images: [],
  fetch: { status: null, finalUrl: null, ms: 0, fallback: 'skipped' },
};

const input: RunExtractionInput = {
  source,
  categories: [{ id: C1, name: 'Home' }],
  examples: [],
  validate: { categoryIds: [C1] },
  jobId: 'job-1',
  deckId: 'deck-1',
  userId: 'user-1',
};

const valid = (confidence: number, title = 'Dan the plumber') => ({
  type: 'text',
  title,
  body: 'Call 050-1234567',
  categoryIds: [C1, '00000000-0000-4000-8000-0000000000ff'],
  language: 'en',
  confidence,
});

function sink() {
  const rows: NewLlmCallRow[] = [];
  return { rows, insert: async (row: NewLlmCallRow) => void rows.push(row) };
}

function setup(script: unknown[]) {
  const extractor = createFakeExtractor({ script });
  const llmCalls = sink();
  const deps = { extractor, model: 'primary', escalationModel: 'strong', llmCalls };
  return { extractor, llmCalls, deps };
}

describe('runExtraction (D105/D110)', () => {
  it('accepts a valid confident proposal with one call', async () => {
    const { extractor, llmCalls, deps } = setup([valid(0.9)]);
    const out = await runExtraction(deps, input);
    expect(out).toMatchObject({
      ok: true,
      item: { title: 'Dan the plumber', status: 'proposed' },
      summary: { model: 'primary', escalated: false, categoryIds: [C1], confidence: 0.9 },
    });
    expect(extractor.calls).toHaveLength(1);
    expect(llmCalls.rows).toEqual([
      expect.objectContaining({
        purpose: 'extract',
        jobId: 'job-1',
        deckId: 'deck-1',
        userId: 'user-1',
      }),
    ]);
  });

  it('retries an invalid output once with a correction', async () => {
    const { extractor, deps } = setup([{ title: 42 }, valid(0.9)]);
    const out = await runExtraction(deps, input);
    expect(out.ok).toBe(true);
    expect(extractor.calls).toHaveLength(2);
    expect(extractor.calls[0]?.input.correction).toBeUndefined();
    expect(extractor.calls[1]?.input.correction).toMatch(/previous propose_card call was invalid/);
  });

  it('fails after a second invalid output', async () => {
    const { extractor, deps } = setup([{ title: 42 }, { nope: true }]);
    const out = await runExtraction(deps, input);
    expect(out).toMatchObject({ ok: false, error: expect.stringMatching(/^invalid_output: /) });
    expect(extractor.calls).toHaveLength(2);
  });

  it('escalates a low-confidence proposal to the strong model', async () => {
    const { extractor, llmCalls, deps } = setup([valid(0.3), valid(0.8, 'Dan — plumber')]);
    const out = await runExtraction(deps, input);
    expect(out).toMatchObject({
      ok: true,
      item: { title: 'Dan — plumber' },
      summary: { model: 'strong', escalated: true },
    });
    expect(extractor.calls.map((c) => c.model)).toEqual(['primary', 'strong']);
    expect(llmCalls.rows.map((r) => r.purpose)).toEqual(['extract', 'extract_escalated']);
  });

  it('keeps the primary proposal when the escalation is invalid', async () => {
    const { deps } = setup([valid(0.3), { bad: 1 }]);
    const out = await runExtraction(deps, input);
    expect(out).toMatchObject({ ok: true, summary: { model: 'primary', escalated: false } });
  });

  it('does not escalate when both models are the same', async () => {
    const { extractor, deps } = setup([valid(0.3)]);
    await runExtraction({ ...deps, escalationModel: 'primary' }, input);
    expect(extractor.calls).toHaveLength(1);
  });

  it('treats a missing tool call as invalid output', async () => {
    let n = 0;
    const extractor: Extractor = {
      provider: 'test',
      async extract() {
        n++;
        if (n === 1) throw new ExtractResponseError('no propose_card');
        return { raw: valid(0.9), inputTokens: 1, outputTokens: 1 };
      },
    };
    const out = await runExtraction(
      { extractor, model: 'm', escalationModel: 's', llmCalls: sink() },
      input,
    );
    expect(out.ok).toBe(true);
    expect(n).toBe(2);
  });

  it('propagates provider errors (pg-boss retries the job)', async () => {
    const extractor: Extractor = {
      provider: 'test',
      async extract() {
        throw new Error('503 overloaded');
      },
    };
    const llmCalls = sink();
    await expect(
      runExtraction({ extractor, model: 'm', escalationModel: 's', llmCalls }, input),
    ).rejects.toThrow('503 overloaded');
    expect(llmCalls.rows[0]).toMatchObject({ status: 'error' });
  });
});
