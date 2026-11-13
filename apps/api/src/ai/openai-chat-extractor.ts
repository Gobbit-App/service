import OpenAI from 'openai';
import { EXTRACT_TIMEOUT_MS } from '@gobbit/shared';
import { buildExtractPrompt, PROPOSE_CARD_TOOL, PROPOSE_CARD_TOOL_NAME } from './extract-prompt';
import {
  EXTRACT_MAX_TOKENS,
  responseError,
  type ExtractCall,
  type ExtractInput,
  type Extractor,
  type ExtractUsage,
} from './extractor';

type UserContent =
  { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };

/** Minimal slice of the `openai` SDK chat client used for extraction (tests pass a fake). */
export interface OpenAiExtractClient {
  chat: {
    completions: {
      create(
        body: {
          model: string;
          max_tokens: number;
          messages: (
            { role: 'system'; content: string } | { role: 'user'; content: UserContent[] }
          )[];
          tools: unknown[];
          tool_choice: { type: 'function'; function: { name: string } };
        },
        options?: { signal?: AbortSignal },
      ): Promise<{
        choices: {
          finish_reason?: string | null;
          message: {
            tool_calls?: { type: string; function?: { name: string; arguments: string } }[] | null;
          };
        }[];
        usage?: { prompt_tokens: number; completion_tokens: number } | null;
      }>;
    };
  };
}

/** `propose_card` in chat-completions function format (same schema as the Anthropic tool). */
export const PROPOSE_CARD_FUNCTION_TOOL = {
  type: 'function' as const,
  function: {
    name: PROPOSE_CARD_TOOL.name,
    description: PROPOSE_CARD_TOOL.description,
    parameters: PROPOSE_CARD_TOOL.input_schema,
  },
};

/** D105: extraction over an OpenAI-compatible chat API (OpenRouter) with a forced function call. */
export function createOpenAiChatExtractor(opts: {
  apiKey: string;
  baseURL?: string;
  provider?: string;
  maxTokens?: number;
  timeoutMs?: number;
  client?: OpenAiExtractClient;
}): Extractor {
  const { apiKey, maxTokens = EXTRACT_MAX_TOKENS, timeoutMs = EXTRACT_TIMEOUT_MS } = opts;
  const client: OpenAiExtractClient =
    opts.client ??
    (new OpenAI({
      apiKey,
      baseURL: opts.baseURL,
      timeout: timeoutMs,
      maxRetries: 0,
    }) as unknown as OpenAiExtractClient);

  return {
    provider: opts.provider ?? 'openai',
    async extract(input: ExtractInput, callOpts): Promise<ExtractCall> {
      const { system, user, imageUrls } = buildExtractPrompt(input);
      const content: UserContent[] = [
        { type: 'text', text: user },
        ...imageUrls.map((url) => ({ type: 'image_url' as const, image_url: { url } })),
      ];
      const response = await client.chat.completions.create(
        {
          model: callOpts.model,
          max_tokens: maxTokens,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content },
          ],
          tools: [PROPOSE_CARD_FUNCTION_TOOL],
          tool_choice: { type: 'function', function: { name: PROPOSE_CARD_TOOL_NAME } },
        },
        { signal: callOpts.signal },
      );

      const choice = response.choices[0];
      const usage: ExtractUsage = {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      };
      const stopReason = choice?.finish_reason;
      const call = choice?.message.tool_calls?.find(
        (c) => c.function?.name === PROPOSE_CARD_TOOL_NAME,
      );
      if (!call?.function) throw responseError('no_call', stopReason, usage);
      // D354: a cut-off call can still parse (a closed prefix), so the stop reason wins.
      if (stopReason === 'length') throw responseError('bad_json', stopReason, usage);
      let raw: unknown;
      try {
        raw = JSON.parse(call.function.arguments);
      } catch {
        throw responseError('bad_json', stopReason, usage);
      }
      return { raw, ...usage };
    },
  };
}
