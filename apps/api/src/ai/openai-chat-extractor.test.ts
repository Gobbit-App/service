import { describe, expect, it, vi } from 'vitest';
import type { NormalizedSource } from '@gobbit/shared';
import { ExtractResponseError, type ExtractInput } from './extractor';
import { createOpenAiChatExtractor, PROPOSE_CARD_FUNCTION_TOOL } from './openai-chat-extractor';
import type { OpenAiExtractClient } from './openai-chat-extractor';

type Create = OpenAiExtractClient['chat']['completions']['create'];
type CreateBody = Parameters<Create>[0];
type Reply = Awaited<ReturnType<Create>>;

const source: NormalizedSource = {
  text: 'Dan the plumber 050-1234567',
  url: 'https://dan.example/',
  images: ['https://res.example/a.jpg'],
  fetch: { status: 200, finalUrl: 'https://dan.example/', ms: 5, fallback: 'none' },
};

const input: ExtractInput = {
  source,
  categories: [{ id: 'c1', name: 'Home' }],
  examples: [],
};

const cardArgs = {
  type: 'text',
  title: 'Dan',
  body: 'b',
  categoryIds: [],
  language: 'en',
  confidence: 0.9,
};

const okReply: Reply = {
  choices: [
    {
      message: {
        tool_calls: [
          {
            type: 'function',
            function: { name: 'propose_card', arguments: JSON.stringify(cardArgs) },
          },
        ],
      },
    },
  ],
  usage: { prompt_tokens: 120, completion_tokens: 30 },
};

function makeClient(reply: Reply) {
  const create = vi.fn(async (..._args: Parameters<Create>): Promise<Reply> => reply);
  const client: OpenAiExtractClient = { chat: { completions: { create } } };
  return { client, create };
}

describe('createOpenAiChatExtractor', () => {
  it('sends the model, forced propose_card function tool and multimodal user content', async () => {
    const { client, create } = makeClient(okReply);
    const extractor = createOpenAiChatExtractor({ apiKey: 'k', client });

    await extractor.extract(input, { model: 'anthropic/claude-haiku-5.5' });

    expect(create).toHaveBeenCalledTimes(1);
    const body = create.mock.calls[0]?.[0] as CreateBody;
    expect(body.model).toBe('anthropic/claude-haiku-5.5');
    expect(body.tools).toEqual([PROPOSE_CARD_FUNCTION_TOOL]);
    expect(body.tool_choice).toEqual({ type: 'function', function: { name: 'propose_card' } });
    expect(body.messages[0]).toEqual({ role: 'system', content: expect.any(String) });
    expect(body.messages[1]).toEqual({
      role: 'user',
      content: [
        { type: 'text', text: expect.stringContaining('<source>') },
        { type: 'image_url', image_url: { url: 'https://res.example/a.jpg' } },
      ],
    });
  });

  it('returns the parsed raw object and token counts', async () => {
    const { client } = makeClient(okReply);
    const extractor = createOpenAiChatExtractor({ apiKey: 'k', client });

    const out = await extractor.extract(input, { model: 'm' });

    expect(out).toEqual({ raw: cardArgs, inputTokens: 120, outputTokens: 30 });
  });

  it("defaults provider to 'openai' and honours an explicit provider", () => {
    const { client } = makeClient(okReply);

    expect(createOpenAiChatExtractor({ apiKey: 'k', client }).provider).toBe('openai');
    expect(
      createOpenAiChatExtractor({ apiKey: 'k', client, provider: 'openrouter' }).provider,
    ).toBe('openrouter');
  });

  it('reports zero tokens when usage is null', async () => {
    const { client } = makeClient({ ...okReply, usage: null });
    const extractor = createOpenAiChatExtractor({ apiKey: 'k', client });

    const out = await extractor.extract(input, { model: 'm' });

    expect(out.inputTokens).toBe(0);
    expect(out.outputTokens).toBe(0);
  });

  it('throws ExtractResponseError when no propose_card tool call is returned', async () => {
    const { client } = makeClient({
      choices: [{ message: { tool_calls: null } }],
      usage: null,
    });
    const extractor = createOpenAiChatExtractor({ apiKey: 'k', client });

    await expect(extractor.extract(input, { model: 'm' })).rejects.toThrow(ExtractResponseError);
  });

  it('throws ExtractResponseError when the tool arguments are invalid JSON', async () => {
    const { client } = makeClient({
      choices: [
        {
          message: {
            tool_calls: [
              { type: 'function', function: { name: 'propose_card', arguments: '{not json' } },
            ],
          },
        },
      ],
      usage: null,
    });
    const extractor = createOpenAiChatExtractor({ apiKey: 'k', client });

    await expect(extractor.extract(input, { model: 'm' })).rejects.toThrow(ExtractResponseError);
  });

  it('forwards the abort signal to the client', async () => {
    const { client, create } = makeClient(okReply);
    const extractor = createOpenAiChatExtractor({ apiKey: 'k', client });
    const controller = new AbortController();

    await extractor.extract(input, { model: 'm', signal: controller.signal });

    expect(create.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
  });

  it('declares title and confidence as required in the function parameters', () => {
    const required = PROPOSE_CARD_FUNCTION_TOOL.function.parameters.required;

    expect(required).toEqual(expect.arrayContaining(['title', 'confidence']));
  });
});
