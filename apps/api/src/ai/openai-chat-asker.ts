import OpenAI from 'openai';
import { ASK_TIMEOUT_MS } from '@pb/shared';
import { AskResponseError } from './anthropic-asker';
import { ASK_TOOL, ASK_TOOL_NAME, askToolInputSchema, buildAskPrompt } from './ask-prompt';
import type { Asker, AskInput, AskOutput } from './asker';

/** Minimal slice of the `openai` SDK chat client used here (tests pass a fake). */
export interface OpenAiChatClient {
  chat: {
    completions: {
      create(
        body: {
          model: string;
          max_tokens: number;
          messages: { role: 'system' | 'user'; content: string }[];
          tools: unknown[];
          tool_choice: { type: 'function'; function: { name: string } };
        },
        options?: { signal?: AbortSignal },
      ): Promise<{
        choices: {
          message: {
            tool_calls?: { type: string; function?: { name: string; arguments: string } }[] | null;
          };
        }[];
        usage?: { prompt_tokens: number; completion_tokens: number } | null;
      }>;
    };
  };
}

/** The `answer` tool in chat-completions function format (same schema as the Anthropic tool). */
export const ASK_FUNCTION_TOOL = {
  type: 'function' as const,
  function: {
    name: ASK_TOOL.name,
    description: ASK_TOOL.description,
    parameters: ASK_TOOL.input_schema,
  },
};

function parseArguments(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new AskResponseError('Ask response arguments are not valid JSON');
  }
}

/**
 * Ask provider over an OpenAI-compatible chat-completions API (OpenRouter), with a forced
 * `answer` function call. Prompt, schema and citation handling are shared with the Anthropic asker.
 */
export function createOpenAiChatAsker(opts: {
  apiKey: string;
  model: string;
  baseURL?: string;
  provider?: string;
  maxTokens?: number;
  timeoutMs?: number;
  client?: OpenAiChatClient;
}): Asker {
  const { apiKey, model, maxTokens = 1024, timeoutMs = ASK_TIMEOUT_MS } = opts;
  const client: OpenAiChatClient =
    opts.client ??
    (new OpenAI({
      apiKey,
      baseURL: opts.baseURL,
      timeout: timeoutMs,
      maxRetries: 0,
    }) as unknown as OpenAiChatClient);

  return {
    provider: opts.provider ?? 'openai',
    model,
    async ask(input: AskInput, askOpts?: { signal?: AbortSignal }): Promise<AskOutput> {
      const { system, user } = buildAskPrompt(input);
      const response = await client.chat.completions.create(
        {
          model,
          max_tokens: maxTokens,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          tools: [ASK_FUNCTION_TOOL],
          tool_choice: { type: 'function', function: { name: ASK_TOOL_NAME } },
        },
        askOpts,
      );

      const call = response.choices[0]?.message.tool_calls?.find(
        (c) => c.type === 'function' && c.function?.name === ASK_TOOL_NAME,
      );
      if (!call?.function) {
        throw new AskResponseError('Ask response contained no answer tool call');
      }

      const parsed = askToolInputSchema.safeParse(parseArguments(call.function.arguments));
      if (!parsed.success) {
        throw new AskResponseError('Ask response did not match the answer schema');
      }

      return {
        answer: parsed.data.answer,
        citedItemIds: parsed.data.citedItemIds,
        grounded: parsed.data.grounded,
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      };
    },
  };
}
