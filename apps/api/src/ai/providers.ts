import { DEFAULT_ASK_MODEL } from '@pb/shared';
import type { Env } from '../env';
import type { Asker } from './asker';
import type { Embedder } from './embedder';
import { createAnthropicAsker } from './anthropic-asker';
import { createOpenAiChatAsker } from './openai-chat-asker';
import { createOpenAiEmbedder } from './openai-embedder';

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
/** OpenRouter's id for the default Ask model (`claude-haiku-5-5` on the Anthropic API). */
export const OPENROUTER_DEFAULT_ASK_MODEL = 'anthropic/claude-haiku-5.5';

type KeyEnv = Pick<Env, 'OPENROUTER_API_KEY' | 'OPENAI_API_KEY' | 'ANTHROPIC_API_KEY'>;
export type ProviderEnv = KeyEnv & Pick<Env, 'EMBEDDING_MODEL' | 'ASK_MODEL'>;

/** Semantic search and the embeddings worker run when any embedding provider key is set (D73). */
export function hasEmbeddingProvider(env: KeyEnv): boolean {
  return Boolean(env.OPENROUTER_API_KEY || env.OPENAI_API_KEY);
}

/** Ask is available when any chat provider key is set (D77). */
export function hasAskProvider(env: KeyEnv): boolean {
  return Boolean(env.OPENROUTER_API_KEY || env.ANTHROPIC_API_KEY);
}

/**
 * OpenRouter names OpenAI models `openai/<id>`. The stored model stays the bare id, so vectors
 * made through either provider compare equal and switching provider re-embeds nothing.
 */
export function openRouterEmbeddingModel(model: string): string {
  return model.includes('/') ? model : `openai/${model}`;
}

/** Embedder for the configured provider; OpenRouter wins when both keys are set. */
export function defaultEmbedder(env: ProviderEnv): Embedder | null {
  if (env.OPENROUTER_API_KEY) {
    return createOpenAiEmbedder({
      apiKey: env.OPENROUTER_API_KEY,
      baseURL: OPENROUTER_BASE_URL,
      provider: 'openrouter',
      model: env.EMBEDDING_MODEL,
      requestModel: openRouterEmbeddingModel(env.EMBEDDING_MODEL),
    });
  }
  if (env.OPENAI_API_KEY) {
    return createOpenAiEmbedder({ apiKey: env.OPENAI_API_KEY, model: env.EMBEDDING_MODEL });
  }
  return null;
}

/** Asker for the configured provider; OpenRouter wins when both keys are set. */
export function defaultAsker(env: ProviderEnv): Asker | null {
  if (env.OPENROUTER_API_KEY) {
    return createOpenAiChatAsker({
      apiKey: env.OPENROUTER_API_KEY,
      baseURL: OPENROUTER_BASE_URL,
      provider: 'openrouter',
      model: env.ASK_MODEL ?? OPENROUTER_DEFAULT_ASK_MODEL,
    });
  }
  if (env.ANTHROPIC_API_KEY) {
    return createAnthropicAsker({
      apiKey: env.ANTHROPIC_API_KEY,
      model: env.ASK_MODEL ?? DEFAULT_ASK_MODEL,
    });
  }
  return null;
}
