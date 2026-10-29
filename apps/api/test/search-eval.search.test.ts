import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DeckRow } from '@gobbit/db';
import { DEFAULT_EMBEDDING_MODEL } from '@gobbit/shared';
import {
  createDeck,
  createItem,
  createSampleWorld,
  loadSearchEval,
  SEARCH_EMBEDDINGS_PATH,
  searchCards,
  TEXT_EVAL_KINDS,
  withTestDb,
} from '@gobbit/db/test';
import {
  createCachedEmbedder,
  embeddingCacheKey,
  loadEmbeddingCache,
  saveEmbeddingCache,
} from '../src/ai/cached-embedder';
import { defaultEmbedder } from '../src/ai/providers';
import { createEmbedItemHandler } from '../src/jobs/embed-item';
import { fuseRrf } from '../src/lib/rrf';
import { createEmbeddingsRepo } from '../src/repositories/embeddings.repo';
import { createLlmCallsRepo } from '../src/repositories/llm-calls.repo';
import { createSearchRepo } from '../src/repositories/search.repo';
import {
  EVAL_K,
  EVAL_MIN_RECALL,
  formatEvalReport,
  scoreEval,
  type EvalOutcome,
} from './search-eval-score';

/**
 * D81: recall@5 of the fixture deck against `search-eval.json`. Vectors come from the committed
 * `search-embeddings.json`; `pnpm test:search:update` fills missing entries with the real API.
 * Without a complete cache only the text-capable pairs are asserted and the hybrid run is skipped.
 */
const CACHE_FILE = fileURLToPath(SEARCH_EMBEDDINGS_PATH);
const model = process.env.EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL;
const update = process.env.SEARCH_EVAL_UPDATE === '1';
// Either provider yields the same vectors under the bare model id, so the cache keys match.
const liveEmbedder = defaultEmbedder({
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  ANTHROPIC_API_KEY: undefined,
  EMBEDDING_MODEL: model,
  ASK_MODEL: undefined,
});
if (update && !liveEmbedder) {
  throw new Error('SEARCH_EVAL_UPDATE=1 needs OPENROUTER_API_KEY or OPENAI_API_KEY');
}

const cases = loadSearchEval();
const cache = await loadEmbeddingCache(CACHE_FILE);
const embedder = createCachedEmbedder({
  cache,
  model,
  fallback: update ? (liveEmbedder ?? undefined) : undefined,
});

describe('search eval (D81)', () => {
  const t = withTestDb();
  let deck: DeckRow;
  const keyById = new Map<string, string>();
  const normalized = new Map<string, string>();
  let semantic = false;

  beforeAll(async () => {
    const world = await createSampleWorld(t.db);
    deck = await createDeck(t.db, world.owner);
    for (const { key, card } of searchCards) {
      const item = await createItem(t.db, deck, { card });
      keyById.set(item.id, key);
    }

    const search = createSearchRepo(t.db);
    for (const { q } of cases) normalized.set(q, await search.normalize(q));

    const embeddings = createEmbeddingsRepo(t.db);
    const texts = [...normalized.values()];
    for (const id of keyById.keys()) {
      const target = await embeddings.loadForEmbedding(id, model);
      if (target) texts.push(target.searchText);
    }
    const covered = texts.every((text) => cache.has(embeddingCacheKey(model, text)));
    semantic = covered || update;
    if (!semantic) {
      console.warn(
        `[search-eval] ${CACHE_FILE} lacks vectors for ${model}; hybrid recall skipped ` +
          '(run `pnpm test:search:update` with OPENROUTER_API_KEY or OPENAI_API_KEY)',
      );
      return;
    }

    const handler = createEmbedItemHandler({
      embedder,
      embeddings,
      llmCalls: createLlmCallsRepo(t.db),
    });
    for (const id of keyById.keys()) expect(await handler(id)).toBe('embedded');
  });

  afterAll(async () => {
    if (update && embedder.misses > 0) await saveEmbeddingCache(CACHE_FILE, cache);
  });

  async function run(withVectors: boolean, kinds?: readonly string[]): Promise<EvalOutcome[]> {
    const search = createSearchRepo(t.db);
    const outcomes: EvalOutcome[] = [];
    for (const evalCase of cases) {
      if (kinds && !kinds.includes(evalCase.kind)) continue;
      const qNormalized = normalized.get(evalCase.q) ?? '';
      const vector = withVectors
        ? ((await embedder.embed([qNormalized])).vectors[0] ?? null)
        : null;
      const arms = await search.hybrid({
        deckId: deck.id,
        role: 'owner',
        qNormalized,
        vector,
        model,
      });
      const topKeys = fuseRrf(arms, EVAL_K).map((f) => keyById.get(f.id) ?? f.id);
      outcomes.push({ evalCase, topKeys });
    }
    return outcomes;
  }

  it('the text arm answers the substring, phone, typo, URL and no-result pairs', async () => {
    const report = scoreEval(await run(false, TEXT_EVAL_KINDS));
    console.log(formatEvalReport('text arm', report));
    expect(report.recall).toBeGreaterThanOrEqual(EVAL_MIN_RECALL);
  });

  it(`hybrid recall@${EVAL_K} over every pair is at least ${EVAL_MIN_RECALL}`, async (ctx) => {
    if (!semantic) ctx.skip();
    const report = scoreEval(await run(true));
    console.log(formatEvalReport('hybrid', report));
    expect(report.recall).toBeGreaterThanOrEqual(EVAL_MIN_RECALL);
  });
});
