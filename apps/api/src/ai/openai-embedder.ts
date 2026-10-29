import OpenAI from 'openai';
import { EMBEDDING_DIMS, EMBED_BATCH_MAX, EMBED_TIMEOUT_MS } from '@gobbit/shared';
import type { EmbedResult, Embedder } from './embedder';

/** Minimal slice of the `openai` SDK client used here (tests pass a fake). */
export interface OpenAiEmbeddingsClient {
  embeddings: {
    create(
      body: { model: string; input: string[]; encoding_format: 'float' },
      options?: { signal?: AbortSignal },
    ): Promise<{
      data: { index: number; embedding: number[] }[];
      usage: { prompt_tokens: number };
    }>;
  };
}

/** Thrown when a returned vector does not match the configured dimensions. */
export class EmbeddingDimensionError extends Error {}

/**
 * OpenAI-compatible embeddings provider behind the `Embedder` interface (D73): OpenAI itself, or
 * OpenRouter via `baseURL`. `model` is the stored identity (staleness, eval cache keys);
 * `requestModel` is the id sent on the wire when the gateway names it differently.
 */
export function createOpenAiEmbedder(opts: {
  apiKey: string;
  model: string;
  requestModel?: string;
  baseURL?: string;
  provider?: string;
  dims?: number;
  timeoutMs?: number;
  client?: OpenAiEmbeddingsClient;
}): Embedder {
  const dims = opts.dims ?? EMBEDDING_DIMS;
  const model = opts.model;
  const requestModel = opts.requestModel ?? model;
  const client: OpenAiEmbeddingsClient =
    opts.client ??
    (new OpenAI({
      apiKey: opts.apiKey,
      baseURL: opts.baseURL,
      timeout: opts.timeoutMs ?? EMBED_TIMEOUT_MS,
      maxRetries: 0,
    }) as unknown as OpenAiEmbeddingsClient);

  return {
    provider: opts.provider ?? 'openai',
    model,
    dims,
    async embed(texts: string[], embedOpts?: { signal?: AbortSignal }): Promise<EmbedResult> {
      if (texts.length === 0) return { vectors: [], inputTokens: 0 };

      const vectors: number[][] = [];
      let inputTokens = 0;

      for (let start = 0; start < texts.length; start += EMBED_BATCH_MAX) {
        const batch = texts.slice(start, start + EMBED_BATCH_MAX);
        const res = await client.embeddings.create(
          { model: requestModel, input: batch, encoding_format: 'float' },
          embedOpts?.signal ? { signal: embedOpts.signal } : undefined,
        );

        const placed: Array<number[] | undefined> = Array.from({ length: batch.length });
        for (const item of res.data) {
          if (!Number.isInteger(item.index) || item.index < 0 || item.index >= batch.length) {
            throw new Error(`OpenAI embedding index out of range: ${item.index}`);
          }
          placed[item.index] = item.embedding;
        }

        for (const vector of placed) {
          if (vector === undefined) {
            throw new Error('OpenAI embedding response is missing a vector for an input');
          }
          if (vector.length !== dims) {
            throw new EmbeddingDimensionError(`expected ${dims} dimensions, got ${vector.length}`);
          }
          vectors.push(vector);
        }

        inputTokens += res.usage.prompt_tokens;
      }

      return { vectors, inputTokens };
    },
  };
}
