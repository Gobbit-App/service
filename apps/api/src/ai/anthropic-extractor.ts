import Anthropic from '@anthropic-ai/sdk';
import { EXTRACT_TIMEOUT_MS } from '@pb/shared';
import { buildExtractPrompt, PROPOSE_CARD_TOOL, PROPOSE_CARD_TOOL_NAME } from './extract-prompt';
import {
  ExtractResponseError,
  type ExtractCall,
  type ExtractInput,
  type Extractor,
} from './extractor';

type UserContent =
  { type: 'text'; text: string } | { type: 'image'; source: { type: 'url'; url: string } };

/** Minimal slice of `@anthropic-ai/sdk` used for extraction (tests pass a fake). */
export interface AnthropicExtractClient {
  messages: {
    create(
      body: {
        model: string;
        max_tokens: number;
        system: string;
        tools: unknown[];
        tool_choice: { type: 'tool'; name: string };
        messages: { role: 'user'; content: UserContent[] }[];
      },
      options?: { signal?: AbortSignal },
    ): Promise<{
      content: ({ type: 'tool_use'; name: string; input: unknown } | { type: string })[];
      usage: { input_tokens: number; output_tokens: number };
    }>;
  };
}

type ToolUseBlock = { type: 'tool_use'; name: string; input: unknown };

function isProposeCard(block: { type: string }): block is ToolUseBlock {
  return block.type === 'tool_use' && 'name' in block && block.name === PROPOSE_CARD_TOOL_NAME;
}

/** D105: extraction over the Anthropic Messages API with a forced `propose_card` tool call. */
export function createAnthropicExtractor(opts: {
  apiKey: string;
  maxTokens?: number;
  timeoutMs?: number;
  client?: AnthropicExtractClient;
}): Extractor {
  const { apiKey, maxTokens = 1024, timeoutMs = EXTRACT_TIMEOUT_MS } = opts;
  const client: AnthropicExtractClient =
    opts.client ??
    (new Anthropic({
      apiKey,
      timeout: timeoutMs,
      maxRetries: 0,
    }) as unknown as AnthropicExtractClient);

  return {
    provider: 'anthropic',
    async extract(input: ExtractInput, callOpts): Promise<ExtractCall> {
      const { system, user, imageUrls } = buildExtractPrompt(input);
      const content: UserContent[] = [
        { type: 'text', text: user },
        ...imageUrls.map((url) => ({
          type: 'image' as const,
          source: { type: 'url' as const, url },
        })),
      ];
      const response = await client.messages.create(
        {
          model: callOpts.model,
          max_tokens: maxTokens,
          system,
          tools: [PROPOSE_CARD_TOOL],
          tool_choice: { type: 'tool', name: PROPOSE_CARD_TOOL_NAME },
          messages: [{ role: 'user', content }],
        },
        { signal: callOpts.signal },
      );

      const toolUse = response.content.find(isProposeCard);
      if (!toolUse) throw new ExtractResponseError('Extraction returned no propose_card call');
      return {
        raw: toolUse.input,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      };
    },
  };
}
