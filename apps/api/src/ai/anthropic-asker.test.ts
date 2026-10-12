import { describe, expect, it, vi } from 'vitest';
import { AskResponseError, createAnthropicAsker } from './anthropic-asker';
import type { AnthropicMessagesClient } from './anthropic-asker';
import { ASK_TOOL, ASK_TOOL_NAME, buildAskPrompt } from './ask-prompt';
import type { AskInput } from './asker';

type Create = AnthropicMessagesClient['messages']['create'];
type CreateBody = Parameters<Create>[0];
type Reply = Awaited<ReturnType<Create>>;

const input: AskInput = {
  question: 'Capital?',
  cards: [{ id: 'a1', title: 'France', body: 'Capital is Paris', details: '' }],
  language: 'latin',
};

const toolReply: Reply = {
  content: [
    {
      type: 'tool_use',
      name: ASK_TOOL_NAME,
      input: { answer: 'Paris', citedItemIds: ['a1'], grounded: true },
    },
  ],
  usage: { input_tokens: 42, output_tokens: 7 },
};

function makeClient(impl: Create) {
  const create = vi.fn(impl);
  const client: AnthropicMessagesClient = { messages: { create } };
  return { client, create };
}

describe('createAnthropicAsker', () => {
  it('sends the forced answer tool, model, system prompt and a single user message', async () => {
    const { client, create } = makeClient(async () => toolReply);
    const asker = createAnthropicAsker({ apiKey: 'test-key', model: 'claude-test', client });

    await asker.ask(input);

    expect(create).toHaveBeenCalledTimes(1);
    const body = create.mock.calls[0]?.[0] as CreateBody;
    expect(body.model).toBe('claude-test');
    expect(body.max_tokens).toBe(1024);
    expect(body.tools).toEqual([ASK_TOOL]);
    expect(body.tool_choice).toEqual({ type: 'tool', name: ASK_TOOL_NAME });
    expect(body.system).toBe(buildAskPrompt(input).system);
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0]?.role).toBe('user');
    expect(body.messages[0]?.content).toContain('<question>Capital?</question>');
  });

  it('parses the tool_use input and usage', async () => {
    const { client } = makeClient(async () => toolReply);
    const asker = createAnthropicAsker({ apiKey: 'test-key', model: 'claude-test', client });

    const out = await asker.ask(input);

    expect(out).toEqual({
      answer: 'Paris',
      citedItemIds: ['a1'],
      grounded: true,
      inputTokens: 42,
      outputTokens: 7,
    });
  });

  it('forwards the abort signal to the client', async () => {
    const { client, create } = makeClient(async () => toolReply);
    const asker = createAnthropicAsker({ apiKey: 'test-key', model: 'claude-test', client });
    const controller = new AbortController();

    await asker.ask(input, { signal: controller.signal });

    expect(create.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
  });

  it('throws AskResponseError when no answer tool_use block is present', async () => {
    const { client } = makeClient(async () => ({
      content: [{ type: 'text' }],
      usage: { input_tokens: 1, output_tokens: 1 },
    }));
    const asker = createAnthropicAsker({ apiKey: 'test-key', model: 'claude-test', client });

    await expect(asker.ask(input)).rejects.toThrow(AskResponseError);
  });

  it('throws AskResponseError when the tool input fails schema validation', async () => {
    const { client } = makeClient(async () => ({
      content: [{ type: 'tool_use', name: ASK_TOOL_NAME, input: { answer: 'Paris' } }],
      usage: { input_tokens: 1, output_tokens: 1 },
    }));
    const asker = createAnthropicAsker({ apiKey: 'test-key', model: 'claude-test', client });

    await expect(asker.ask(input)).rejects.toThrow(AskResponseError);
  });

  it('propagates client errors unchanged', async () => {
    const { client } = makeClient(async () => {
      throw new Error('boom');
    });
    const asker = createAnthropicAsker({ apiKey: 'test-key', model: 'claude-test', client });

    await expect(asker.ask(input)).rejects.toThrow('boom');
  });
});
