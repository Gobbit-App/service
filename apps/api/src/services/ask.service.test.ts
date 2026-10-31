import { ASK_RATE_LIMIT_PER_HOUR } from '@gobbit/shared';
import { describe, expect, it, vi } from 'vitest';
import type { Asker, AskInput, AskOutput } from '../ai/asker';
import { NOT_FOUND_ANSWER } from '../ai/ask-prompt';
import { createAskService } from './ask.service';

const user = { id: 'u1', accountId: 'a1', email: 'u@example.test' } as never;

const hit = (id: string, title: string) => ({
  id,
  why: 'text' as const,
  score: 1,
  row: { id, title, body: `${title} body`, type: 'text', payload: {} },
});

const output = (overrides: Partial<AskOutput> = {}): AskOutput => ({
  answer: 'A',
  citedItemIds: ['c1'],
  grounded: true,
  inputTokens: 1,
  outputTokens: 1,
  ...overrides,
});

function makeAsker(result: AskOutput = output()) {
  const ask = vi.fn(async (_input: AskInput, _opts?: { signal?: AbortSignal }) => result);
  return { provider: 'fake', model: 'm', ask } satisfies Asker & { ask: unknown };
}

function build(
  options: {
    hits?: ReturnType<typeof hit>[];
    asker?: ReturnType<typeof makeAsker> | null;
    timeoutMs?: number;
  } = {},
) {
  const search = {
    retrieve: vi.fn(async () => ({
      deckId: 'd1',
      role: 'owner',
      qNormalized: 'q',
      semantic: false,
      hits: options.hits ?? [hit('c1', 'Alpha')],
    })),
  };
  const rateLimits = { enforce: vi.fn(async () => {}) };
  const llmCalls = { insert: vi.fn(async () => {}) };
  const asker = options.asker === undefined ? makeAsker() : options.asker;
  const service = createAskService({
    asker: asker as Asker | null,
    search: search as never,
    rateLimits: rateLimits as never,
    llmCalls: llmCalls as never,
    timeoutMs: options.timeoutMs,
    log: () => {},
  });
  return { service, search, rateLimits, asker };
}

describe('createAskService.ask', () => {
  it('rejects with 503 when no asker is configured, before rate limiting', async () => {
    const { service, rateLimits, search } = build({ asker: null });
    await expect(service.ask(user, 'deck', 'what is alpha?')).rejects.toMatchObject({
      status: 503,
    });
    expect(rateLimits.enforce).not.toHaveBeenCalled();
    expect(search.retrieve).not.toHaveBeenCalled();
  });

  it('enforces the per-user rate limit before retrieval; rejection stops retrieval', async () => {
    const { service, rateLimits, search, asker } = build();
    rateLimits.enforce.mockRejectedValueOnce(Object.assign(new Error('limited'), { status: 429 }));
    await expect(service.ask(user, 'deck', 'what is alpha?')).rejects.toMatchObject({
      status: 429,
    });
    expect(rateLimits.enforce).toHaveBeenCalledWith(
      expect.stringContaining('u1'),
      ASK_RATE_LIMIT_PER_HOUR,
    );
    expect(search.retrieve).not.toHaveBeenCalled();
    expect(asker?.ask).not.toHaveBeenCalled();
  });

  it('returns the not-found answer without calling the asker when nothing is retrieved', async () => {
    const { service, asker } = build({ hits: [] });
    const res = await service.ask(user, 'deck', 'what is alpha?');
    expect(res).toEqual({
      answer: NOT_FOUND_ANSWER.latin,
      citations: [],
      grounded: false,
    });
    expect(asker?.ask).not.toHaveBeenCalled();
  });

  it('passes cards and the Hebrew language to the asker and resolves citations', async () => {
    const asker = makeAsker(output({ answer: 'כלב', citedItemIds: ['c2', 'c2', 'x'] }));
    const { service } = build({ asker, hits: [hit('c1', 'Alpha'), hit('c2', 'Beta')] });
    const question = 'מה השם של הכלב?';

    const res = await service.ask(user, 'deck', question);

    expect(asker.ask).toHaveBeenCalledWith(
      expect.objectContaining({
        question,
        language: 'hebrew',
        cards: [
          { id: 'c1', title: 'Alpha', body: 'Alpha body', details: expect.any(String) },
          { id: 'c2', title: 'Beta', body: 'Beta body', details: expect.any(String) },
        ],
      }),
      expect.anything(),
    );
    expect(res).toEqual({
      answer: 'כלב',
      citations: [{ itemId: 'c2', title: 'Beta' }],
      grounded: true,
    });
  });

  it('returns not-found when the model cites only unknown ids', async () => {
    const asker = makeAsker(output({ citedItemIds: ['nope'], grounded: true }));
    const { service } = build({ asker });
    const res = await service.ask(user, 'deck', 'what is alpha?');
    expect(res).toEqual({
      answer: NOT_FOUND_ANSWER.latin,
      citations: [],
      grounded: false,
    });
  });

  it('returns not-found when the model reports ungrounded', async () => {
    const asker = makeAsker(output({ grounded: false, citedItemIds: ['c1'] }));
    const { service } = build({ asker });
    const res = await service.ask(user, 'deck', 'what is alpha?');
    expect(res.grounded).toBe(false);
    expect(res.citations).toEqual([]);
    expect(res.answer).toBe(NOT_FOUND_ANSWER.latin);
  });

  it('maps a provider failure to 503', async () => {
    const asker = makeAsker();
    asker.ask.mockRejectedValueOnce(new Error('upstream down'));
    const { service } = build({ asker });
    await expect(service.ask(user, 'deck', 'what is alpha?')).rejects.toMatchObject({
      status: 503,
    });
  });

  it('maps an aborted (too slow) provider call to 504', async () => {
    const asker = makeAsker();
    asker.ask.mockImplementationOnce(
      (_input: AskInput, opts?: { signal?: AbortSignal }) =>
        new Promise<AskOutput>((_, reject) => {
          opts?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    const { service } = build({ asker, timeoutMs: 10 });
    await expect(service.ask(user, 'deck', 'what is alpha?')).rejects.toMatchObject({
      status: 504,
    });
  });
});
