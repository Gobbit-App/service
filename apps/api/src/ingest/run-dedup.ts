import type { DedupVerdict } from '@pb/shared';
import type { Embedder } from '../ai/embedder';
import { recordLlmCall, type LlmCallSink } from '../ai/llm-calls';
import type { DedupRepo } from '../repositories/dedup.repo';
import type { EmbeddingsRepo } from '../repositories/embeddings.repo';
import { dedupVerdict, normalizeSourceUrl } from './dedup-verdict';

export interface RunDedupDeps {
  dedup: DedupRepo;
  /** Null without an embedding key: the keyless path (source URL, then title) runs. */
  embedder: Embedder | null;
  embeddings: Pick<EmbeddingsRepo, 'loadForEmbedding' | 'saveEmbedding'>;
  llmCalls: LlmCallSink;
  log?: (message: string) => void;
}

export interface RunDedupInput {
  itemId: string;
  deckId: string;
  title: string;
  sourceUrl: string | null;
  jobId: string;
  userId: string;
  signal?: AbortSignal;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

/**
 * D103: embeds the draft (`embed_draft`, stored on the item so the sweep skips it) and decides
 * how the proposal relates to the deck. The proposal already exists, so an embedding failure
 * degrades to the keyless signals instead of retrying the whole job.
 */
export async function runDedup(deps: RunDedupDeps, input: RunDedupInput): Promise<DedupVerdict> {
  const log = deps.log ?? ((m: string) => console.error(m));

  async function sourceUrlMatch(): Promise<string | null> {
    const host = input.sourceUrl ? hostOf(input.sourceUrl) : null;
    if (!input.sourceUrl || !host) return null;
    const wanted = normalizeSourceUrl(input.sourceUrl);
    const candidates = await deps.dedup.sourceUrlCandidates(input.deckId, input.itemId, host);
    return candidates.find((c) => normalizeSourceUrl(c.sourceUrl) === wanted)?.id ?? null;
  }

  async function embedDraft(embedder: Embedder): Promise<number[] | null> {
    try {
      const target = await deps.embeddings.loadForEmbedding(input.itemId, embedder.model);
      if (!target) return null;
      const { vectors } = await recordLlmCall(
        deps.llmCalls,
        {
          purpose: 'embed_draft',
          provider: embedder.provider,
          model: embedder.model,
          deckId: input.deckId,
          itemId: input.itemId,
          userId: input.userId,
          jobId: input.jobId,
        },
        () => embedder.embed([target.searchText], { signal: input.signal }),
      );
      const vector = vectors[0];
      if (!vector) return null;
      await deps.embeddings.saveEmbedding(input.itemId, {
        vector,
        model: embedder.model,
        hash: target.hash,
      });
      return vector;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log(`[ingest] draft embedding for ${input.itemId} failed, using keyless dedup: ${message}`);
      return null;
    }
  }

  const { embedder } = deps;
  const vector = embedder ? await embedDraft(embedder) : null;
  const semantic = vector !== null;
  const [urlMatch, nearest, titleMatch] = await Promise.all([
    sourceUrlMatch(),
    vector && embedder
      ? deps.dedup.nearest(input.deckId, input.itemId, vector, embedder.model)
      : Promise.resolve(null),
    semantic
      ? Promise.resolve(null)
      : deps.dedup.titleMatch(input.deckId, input.itemId, input.title),
  ]);

  return dedupVerdict({ sourceUrlMatch: urlMatch, nearest, titleMatch, semantic });
}
