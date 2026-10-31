import {
  DEFAULT_ASK_MODEL,
  DEFAULT_EXTRACT_ESCALATION_MODEL,
  DEFAULT_EXTRACT_MODEL,
} from '@gobbit/shared';
import type { Env } from '../env';
import type { Asker } from './asker';
import type { Embedder } from './embedder';
import type { Extractor } from './extractor';
import { createAnthropicExtractor } from './anthropic-extractor';
import { createOpenAiChatExtractor } from './openai-chat-extractor';
import { createAnthropicAsker } from './anthropic-asker';
import { createOpenAiChatAsker } from './openai-chat-asker';
import { createOpenAiEmbedder } from './openai-embedder';

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
/** OpenRouter's id for the default Ask model (`claude-haiku-5-5` on the Anthropic API). */
export const OPENROUTER_DEFAULT_ASK_MODEL = 'anthropic/claude-haiku-5.5';
/** OpenRouter ids for the default extraction models (D105). */
export const OPENROUTER_DEFAULT_EXTRACT_MODEL = 'anthropic/claude-haiku-5.5';
export const OPENROUTER_DEFAULT_EXTRACT_ESCALATION_MODEL = 'anthropic/claude-sonnet-5.5';

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

/** D93: ingestion (extraction) runs on the same chat providers as Ask. */
export function hasExtractProvider(env: KeyEnv): boolean {
  return hasAskProvider(env);
}

/**
 * D104: email-in needs the inbound domain, the webhook signing secret and the Resend API key
 * (the webhook carries metadata only; the body and attachments are fetched with the key).
 */
export function emailIngestDomain(
  env: Pick<Env, 'INGEST_EMAIL_DOMAIN' | 'RESEND_WEBHOOK_SECRET' | 'RESEND_API_KEY'>,
): string | null {
  return env.INGEST_EMAIL_DOMAIN && env.RESEND_WEBHOOK_SECRET && env.RESEND_API_KEY
    ? env.INGEST_EMAIL_DOMAIN
    : null;
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

export type ExtractEnv = KeyEnv & Pick<Env, 'EXTRACT_MODEL' | 'EXTRACT_ESCALATION_MODEL'>;

/** The extractor plus the primary and escalation model ids it is called with (D105). */
export interface ExtractSetup {
  extractor: Extractor;
  model: string;
  escalationModel: string;
}

/** Extraction for the configured chat provider; OpenRouter wins when both keys are set. */
export function defaultExtractor(env: ExtractEnv): ExtractSetup | null {
  if (env.OPENROUTER_API_KEY) {
    return {
      extractor: createOpenAiChatExtractor({
        apiKey: env.OPENROUTER_API_KEY,
        baseURL: OPENROUTER_BASE_URL,
        provider: 'openrouter',
      }),
      model: env.EXTRACT_MODEL ?? OPENROUTER_DEFAULT_EXTRACT_MODEL,
      escalationModel: env.EXTRACT_ESCALATION_MODEL ?? OPENROUTER_DEFAULT_EXTRACT_ESCALATION_MODEL,
    };
  }
  if (env.ANTHROPIC_API_KEY) {
    return {
      extractor: createAnthropicExtractor({ apiKey: env.ANTHROPIC_API_KEY }),
      model: env.EXTRACT_MODEL ?? DEFAULT_EXTRACT_MODEL,
      escalationModel: env.EXTRACT_ESCALATION_MODEL ?? DEFAULT_EXTRACT_ESCALATION_MODEL,
    };
  }
  return null;
}
