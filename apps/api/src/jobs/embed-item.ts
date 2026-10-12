import type { Embedder } from '../ai/embedder';
import { recordLlmCall, type LlmCallSink } from '../ai/llm-calls';
import type { EmbeddingsRepo } from '../repositories/embeddings.repo';

export type EmbedItemOutcome = 'embedded' | 'fresh' | 'missing' | 'superseded';

/**
 * D72/D74: embeds one item if its stored vector is stale. Provider errors propagate so pg-boss
 * retries with backoff; an edit racing the call makes the save a no-op (`superseded`).
 */
export function createEmbedItemHandler(deps: {
  embedder: Embedder;
  embeddings: Pick<EmbeddingsRepo, 'loadForEmbedding' | 'saveEmbedding'>;
  llmCalls: LlmCallSink;
}) {
  const { embedder, embeddings, llmCalls } = deps;

  return async function embedItem(
    itemId: string,
    job?: { id?: string; signal?: AbortSignal },
  ): Promise<EmbedItemOutcome> {
    const target = await embeddings.loadForEmbedding(itemId, embedder.model);
    if (!target) return 'missing';
    if (!target.stale) return 'fresh';

    const { vectors } = await recordLlmCall(
      llmCalls,
      {
        purpose: 'embed_item',
        provider: embedder.provider,
        model: embedder.model,
        deckId: target.deckId,
        itemId: target.id,
        jobId: job?.id ?? null,
      },
      () => embedder.embed([target.searchText], { signal: job?.signal }),
    );

    const vector = vectors[0];
    if (!vector) throw new Error(`Embedder returned no vector for item ${itemId}`);

    const saved = await embeddings.saveEmbedding(target.id, {
      vector,
      model: embedder.model,
      hash: target.hash,
    });
    return saved ? 'embedded' : 'superseded';
  };
}
