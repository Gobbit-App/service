import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createCachedEmbedder,
  decodeVector,
  EmbeddingCacheMissError,
  embeddingCacheKey,
  encodeVector,
  loadEmbeddingCache,
  saveEmbeddingCache,
  type EmbeddingCache,
} from './cached-embedder';
import type { Embedder } from './embedder';

const MODEL = 'test-model';
const DIMS = 3;

function cacheWith(entries: Record<string, number[]>): EmbeddingCache {
  return new Map<string, string>(
    Object.entries(entries).map(([text, vector]): [string, string] => [
      embeddingCacheKey(MODEL, text),
      encodeVector(vector),
    ]),
  );
}

function fakeFallback(): Embedder & { calls: string[][] } {
  const calls: string[][] = [];
  return {
    provider: 'fake',
    model: 'fake-model',
    dims: DIMS,
    calls,
    async embed(texts) {
      calls.push([...texts]);
      return {
        vectors: texts.map((t) => [t.length, 1, 0.5]),
        inputTokens: texts.length * 2,
      };
    },
  };
}

describe('encodeVector / decodeVector', () => {
  it('roundtrips values at float32 precision', () => {
    const v = [0.1, -0.25, 3.14159, 0];
    const out = decodeVector(encodeVector(v));
    expect(out).toHaveLength(v.length);
    v.forEach((x, i) => expect(out[i]).toBeCloseTo(x, 6));
  });
});

describe('embeddingCacheKey', () => {
  it('is model + ":" + sha256 hex of the text', () => {
    const expected = `${MODEL}:${createHash('sha256').update('hello').digest('hex')}`;
    expect(embeddingCacheKey(MODEL, 'hello')).toBe(expected);
  });
});

describe('createCachedEmbedder', () => {
  let dir: string | undefined;

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it('serves hits without calling a fallback', async () => {
    const embedder = createCachedEmbedder({
      cache: cacheWith({ a: [1, 0, 0] }),
      model: MODEL,
      dims: DIMS,
    });
    const result = await embedder.embed(['a', 'a']);
    expect(result.inputTokens).toBe(0);
    expect(result.vectors).toHaveLength(2);
    expect(result.vectors[0]?.[0]).toBeCloseTo(1, 6);
    expect(embedder.misses).toBe(0);
  });

  it('throws EmbeddingCacheMissError listing every missing text when no fallback', async () => {
    const embedder = createCachedEmbedder({
      cache: cacheWith({ a: [1, 0, 0] }),
      model: MODEL,
      dims: DIMS,
    });
    const err = await embedder.embed(['a', 'b', 'c']).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EmbeddingCacheMissError);
    expect(err instanceof EmbeddingCacheMissError && err.texts).toEqual(['b', 'c']);
  });

  it('sends only misses to the fallback, stores them, and counts them', async () => {
    const cache = cacheWith({ a: [1, 0, 0] });
    const fallback = fakeFallback();
    const embedder = createCachedEmbedder({ cache, model: MODEL, dims: DIMS, fallback });

    const result = await embedder.embed(['a', 'b', 'c']);

    expect(fallback.calls).toEqual([['b', 'c']]);
    expect(result.vectors).toHaveLength(3);
    expect(result.vectors[1]?.[0]).toBeCloseTo(1, 6); // 'b'.length
    expect(result.inputTokens).toBe(4);
    expect(embedder.misses).toBe(2);
    expect(cache.has(embeddingCacheKey(MODEL, 'b'))).toBe(true);
    expect(cache.has(embeddingCacheKey(MODEL, 'c'))).toBe(true);

    // Stored misses are now hits: no further fallback call.
    await embedder.embed(['b', 'c']);
    expect(fallback.calls).toHaveLength(1);
    expect(embedder.misses).toBe(2);
  });

  it('loads a missing cache file as an empty map', async () => {
    dir = await mkdtemp(join(tmpdir(), 'cache-test-'));
    const cache = await loadEmbeddingCache(join(dir, 'nope.json'));
    expect(cache.size).toBe(0);
  });

  it('saves with sorted keys and loads back identically', async () => {
    dir = await mkdtemp(join(tmpdir(), 'cache-test-'));
    const path = join(dir, 'cache.json');
    const cache: EmbeddingCache = new Map([
      ['z:1', encodeVector([1, 2, 3])],
      ['a:2', encodeVector([4, 5, 6])],
    ]);

    await saveEmbeddingCache(path, cache);

    const raw = await readFile(path, 'utf8');
    expect(raw.endsWith('\n')).toBe(true);
    expect(raw.indexOf('"a:2"')).toBeLessThan(raw.indexOf('"z:1"'));

    const loaded = await loadEmbeddingCache(path);
    expect(loaded).toEqual(cache);
  });
});
