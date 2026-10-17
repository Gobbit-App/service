import { describe, expect, it, vi } from 'vitest';
import { createAnthropicExtractor } from './anthropic-extractor';
import type { AnthropicExtractClient } from './anthropic-extractor';
import { PROPOSE_CARD_TOOL, PROPOSE_CARD_TOOL_NAME } from './extract-prompt';
import { ExtractResponseError } from './extractor';
import type { ExtractInput } from './extractor';

type Create = AnthropicExtractClient['messages']['create'];
type CreateBody = Parameters<Create>[0];
type Reply = Awaited<ReturnType<Create>>;

const input: ExtractInput = {
  source: {
    text: 'Dan the plumber 050-1234567',
    url: 'https://dan.example/',
    images: ['https://res.example/a.jpg'],
    fetch: { status: 200, finalUrl: 'https://dan.example/', ms: 5, fallback: 'none' },
  },
  categories: [{ id: 'c1', name: 'Home' }],
  examples: [],
};

const proposal = {
  type: 'text',
  title: 'Dan the plumber',
  body: 'Dan the plumber 050-1234567',
  categoryIds: ['c1'],
  language: 'en',
  confidence: 0.9,
};

const toolReply: Reply = {
  content: [{ type: 'tool_use', name: PROPOSE_CARD_TOOL_NAME, input: proposal }],
  usage: { input_tokens: 11, output_tokens: 4 },
};

function makeClient(impl: Create) {
  const create = vi.fn(impl);
  const client: AnthropicExtractClient = { messages: { create } };
  return { client, create };
}

describe('createAnthropicExtractor (D105)', () => {
  it('sends model, forced propose_card tool, system prompt and a text+image user message', async () => {
    const { client, create } = makeClient(async () => toolReply);
    const extractor = createAnthropicExtractor({ apiKey: 'k', client });

    await extractor.extract(input, { model: 'claude-haiku-5-5' });

    expect(create).toHaveBeenCalledTimes(1);
    const body = create.mock.calls[0]?.[0] as CreateBody;
    expect(body.model).toBe('claude-haiku-5-5');
    expect(body.tools).toEqual([PROPOSE_CARD_TOOL]);
    expect(body.tool_choice).toEqual({ type: 'tool', name: PROPOSE_CARD_TOOL_NAME });
    expect(typeof body.system).toBe('string');
    expect(body.system.length).toBeGreaterThan(0);
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0]?.role).toBe('user');

    const content = body.messages[0]?.content;
    expect(content?.[0]?.type).toBe('text');
    const first = content?.[0];
    expect(first?.type === 'text' && first.text).toContain('<source>');
    expect(content?.[1]).toEqual({
      type: 'image',
      source: { type: 'url', url: 'https://res.example/a.jpg' },
    });
  });

  it('returns the tool_use input as raw, usage tokens, and provider anthropic', async () => {
    const { client } = makeClient(async () => toolReply);
    const extractor = createAnthropicExtractor({ apiKey: 'k', client });

    const out = await extractor.extract(input, { model: 'claude-haiku-5-5' });

    expect(extractor.provider).toBe('anthropic');
    expect(out).toEqual({ raw: proposal, inputTokens: 11, outputTokens: 4 });
  });

  it('forwards the abort signal to the client', async () => {
    const { client, create } = makeClient(async () => toolReply);
    const extractor = createAnthropicExtractor({ apiKey: 'k', client });
    const controller = new AbortController();

    await extractor.extract(input, { model: 'claude-haiku-5-5', signal: controller.signal });

    expect(create.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
  });

  it('throws ExtractResponseError when no propose_card tool_use block is present', async () => {
    const textBlock = { type: 'text', text: 'hi' };
    const { client } = makeClient(async () => ({
      content: [textBlock],
      usage: { input_tokens: 1, output_tokens: 1 },
    }));
    const extractor = createAnthropicExtractor({ apiKey: 'k', client });

    await expect(extractor.extract(input, { model: 'claude-haiku-5-5' })).rejects.toThrow(
      ExtractResponseError,
    );
  });

  it('throws ExtractResponseError when the tool_use has a different name', async () => {
    const { client } = makeClient(async () => ({
      content: [{ type: 'tool_use', name: 'other_tool', input: {} }],
      usage: { input_tokens: 1, output_tokens: 1 },
    }));
    const extractor = createAnthropicExtractor({ apiKey: 'k', client });

    await expect(extractor.extract(input, { model: 'claude-haiku-5-5' })).rejects.toThrow(
      ExtractResponseError,
    );
  });

  it('propagates client errors unchanged', async () => {
    const { client } = makeClient(async () => {
      throw new Error('boom');
    });
    const extractor = createAnthropicExtractor({ apiKey: 'k', client });

    await expect(extractor.extract(input, { model: 'claude-haiku-5-5' })).rejects.toThrow('boom');
  });
});
