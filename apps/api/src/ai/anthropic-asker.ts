import Anthropic from '@anthropic-ai/sdk';
import { ASK_TIMEOUT_MS } from '@gobbit/shared';
import { ASK_TOOL, ASK_TOOL_NAME, askToolInputSchema, buildAskPrompt } from './ask-prompt';
import type { Asker, AskInput, AskOutput } from './asker';

/** Minimal slice of `@anthropic-ai/sdk` used here (tests pass a fake). */
export interface AnthropicMessagesClient {
  messages: {
    create(
      body: {
        model: string;
        max_tokens: number;
        system: string;
        tools: unknown[];
        tool_choice: { type: 'tool'; name: string };
        messages: { role: 'user'; content: string }[];
      },
      options?: { signal?: AbortSignal },
    ): Promise<{
      content: ({ type: 'tool_use'; name: string; input: unknown } | { type: string })[];
      usage: { input_tokens: number; output_tokens: number };
    }>;
  };
}

type ToolUseBlock = { type: 'tool_use'; name: string; input: unknown };
type ContentBlock = ToolUseBlock | { type: string };

export class AskResponseError extends Error {}

function isAskToolUse(block: ContentBlock): block is ToolUseBlock {
  return block.type === 'tool_use' && 'name' in block && block.name === ASK_TOOL_NAME;
}

/** Ask provider backed by the Anthropic Messages API with a forced `answer` tool call. */
export function createAnthropicAsker(opts: {
  apiKey: string;
  model: string;
  maxTokens?: number;
  timeoutMs?: number;
  client?: AnthropicMessagesClient;
}): Asker {
  const { apiKey, model, maxTokens = 1024, timeoutMs = ASK_TIMEOUT_MS } = opts;
  const client: AnthropicMessagesClient =
    opts.client ??
    (new Anthropic({
      apiKey,
      timeout: timeoutMs,
      maxRetries: 0,
    }) as unknown as AnthropicMessagesClient);

  return {
    provider: 'anthropic',
    model,
    async ask(input: AskInput, askOpts?: { signal?: AbortSignal }): Promise<AskOutput> {
      const { system, user } = buildAskPrompt(input);
      const response = await client.messages.create(
        {
          model,
          max_tokens: maxTokens,
          system,
          tools: [ASK_TOOL],
          tool_choice: { type: 'tool', name: ASK_TOOL_NAME },
          messages: [{ role: 'user', content: user }],
        },
        askOpts,
      );

      const toolUse = response.content.find(isAskToolUse);
      if (!toolUse) {
        throw new AskResponseError('Ask response contained no answer tool call');
      }

      const parsed = askToolInputSchema.safeParse(toolUse.input);
      if (!parsed.success) {
        throw new AskResponseError('Ask response did not match the answer schema');
      }

      return {
        answer: parsed.data.answer,
        citedItemIds: parsed.data.citedItemIds,
        grounded: parsed.data.grounded,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      };
    },
  };
}
