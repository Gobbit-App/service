import { describe, expect, it, vi } from 'vitest';
import { AskResponseError } from './anthropic-asker';
import { ASK_TOOL_NAME, buildAskPrompt } from './ask-prompt';
import type { AskInput } from './asker';
import {
  ASK_FUNCTION_TOOL,
  createOpenAiChatAsker,
  type OpenAiChatClient,
} from './openai-chat-asker';

type Create = OpenAiChatClient['chat']['completions']['create'];
type CreateBody = Parameters<Create>[0];
type Reply = Awaited<ReturnType<Create>>;

const input: AskInput = {
  question: 'Capital?',
  cards: [{ id: 'a1', title: 'France', body: 'Capital is Paris', details: '' }],
  language: 'latin',
};

function replyWith(args: string, name = ASK_TOOL_NAME): Reply {
  return {
    choices: [
      { message: { tool_calls: [{ type: 'function', function: { name, arguments: args } }] } },
    ],
    usage: { prompt_tokens: 42, completion_tokens: 7 },
  };
}

const toolReply = replyWith(
  JSON.stringify({ answer: 'Paris', citedItemIds: ['a1'], grounded: true }),
);

function makeAsker(impl: Create) {
  const create = vi.fn(impl);
  const client: OpenAiChatClient = { chat: { completions: { create } } };
  const asker = createOpenAiChatAsker({
    apiKey: 'test-key',
    model: 'anthropic/claude-test',
    provider: 'openrouter',
    client,
  });
  return { asker, create };
}

describe('createOpenAiChatAsker', () => {
  it('sends the forced answer function, model, system and user messages', async () => {
    const { asker, create } = makeAsker(async () => toolReply);

    await asker.ask(input);

    const body = create.mock.calls[0]?.[0] as CreateBody;
    const prompt = buildAskPrompt(input);
    expect(body.model).toBe('anthropic/claude-test');
    expect(body.max_tokens).toBe(1024);
    expect(body.tools).toEqual([ASK_FUNCTION_TOOL]);
    expect(body.tool_choice).toEqual({ type: 'function', function: { name: ASK_TOOL_NAME } });
    expect(body.messages).toEqual([
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user },
    ]);
    expect(asker.provider).toBe('openrouter');
  });

  it('parses the function arguments and usage', async () => {
    const { asker } = makeAsker(async () => toolReply);

    await expect(asker.ask(input)).resolves.toEqual({
      answer: 'Paris',
      citedItemIds: ['a1'],
      grounded: true,
      inputTokens: 42,
      outputTokens: 7,
    });
  });

  it('reports zero tokens when the gateway omits usage', async () => {
    const { asker } = makeAsker(async () => ({ ...toolReply, usage: null }));

    const out = await asker.ask(input);

    expect([out.inputTokens, out.outputTokens]).toEqual([0, 0]);
  });

  it('forwards the abort signal to the client', async () => {
    const { asker, create } = makeAsker(async () => toolReply);
    const controller = new AbortController();

    await asker.ask(input, { signal: controller.signal });

    expect(create.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
  });

  it('throws AskResponseError when no answer function call is present', async () => {
    const { asker } = makeAsker(async () => ({ choices: [{ message: { tool_calls: null } }] }));

    await expect(asker.ask(input)).rejects.toThrow(AskResponseError);
  });

  it('throws AskResponseError when a different function was called', async () => {
    const { asker } = makeAsker(async () => replyWith('{}', 'other'));

    await expect(asker.ask(input)).rejects.toThrow(AskResponseError);
  });

  it('throws AskResponseError when the arguments are not JSON', async () => {
    const { asker } = makeAsker(async () => replyWith('{not json'));

    await expect(asker.ask(input)).rejects.toThrow('not valid JSON');
  });

  it('throws AskResponseError when the arguments fail schema validation', async () => {
    const { asker } = makeAsker(async () => replyWith(JSON.stringify({ answer: 'Paris' })));

    await expect(asker.ask(input)).rejects.toThrow('did not match the answer schema');
  });

  it('propagates client errors unchanged', async () => {
    const { asker } = makeAsker(async () => {
      throw new Error('boom');
    });

    await expect(asker.ask(input)).rejects.toThrow('boom');
  });
});
