import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { EMBEDDING_DIMS } from '@gobbit/shared';
import type { Embedder, EmbedResult } from './embedder';

/** `model + ':' + sha256hex(text)` — the committed eval cache key (D81). */
export function embeddingCacheKey(model: string, text: string): string {
  return `${model}:${createHash('sha256').update(text).digest('hex')}`;
}

/** Float32 little-endian → base64. */
export function encodeVector(vector: number[]): string {
  const buf = Buffer.alloc(vector.length * 4);
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  vector.forEach((v, i) => view.setFloat32(i * 4, v, true));
  return buf.toString('base64');
}

/** Base64 → Float32 little-endian vector. */
export function decodeVector(encoded: string): number[] {
  const buf = Buffer.from(encoded, 'base64');
  if (buf.length % 4 !== 0) throw new Error('invalid float32 vector encoding');
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const out: number[] = [];
  for (let i = 0; i < buf.length; i += 4) out.push(view.getFloat32(i, true));
  return out;
}

export type EmbeddingCache = Map<string, string>; // key → base64 float32

function isEnoent(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === 'ENOENT';
}

/** Loads the key→base64 cache file; a missing file yields an empty cache. */
export async function loadEmbeddingCache(path: string): Promise<EmbeddingCache> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (err) {
    if (isEnoent(err)) return new Map();
    throw err;
  }
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`embedding cache at ${path} must be a JSON object`);
  }
  const cache: EmbeddingCache = new Map();
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value !== 'string') {
      throw new Error(`embedding cache entry ${key} must be a base64 string`);
    }
    cache.set(key, value);
  }
  return cache;
}

/** Writes the cache as JSON with sorted keys, 2-space indent, trailing newline. */
export async function saveEmbeddingCache(path: string, cache: EmbeddingCache): Promise<void> {
  const sorted = [...cache].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  await writeFile(path, JSON.stringify(Object.fromEntries(sorted), null, 2) + '\n', 'utf8');
}

/** Thrown when a text is absent from the cache and no fallback embedder is configured. */
export class EmbeddingCacheMissError extends Error {
  readonly texts: string[];

  constructor(texts: string[]) {
    super(`${texts.length} text(s) missing from embedding cache`);
    this.name = 'EmbeddingCacheMissError';
    this.texts = texts;
  }
}

/** Embedder that reads vectors from a cache; misses go to `fallback` (stored) or throw. */
export function createCachedEmbedder(opts: {
  cache: EmbeddingCache;
  model: string;
  dims?: number;
  fallback?: Embedder;
}): Embedder & { readonly misses: number } {
  const { cache, model, fallback } = opts;
  const dims = opts.dims ?? EMBEDDING_DIMS;
  let misses = 0;

  const readCached = (text: string): number[] | undefined => {
    const encoded = cache.get(embeddingCacheKey(model, text));
    if (encoded === undefined) return undefined;
    const vector = decodeVector(encoded);
    return vector.length === dims ? vector : undefined;
  };

  return {
    provider: 'cache',
    model,
    dims,
    get misses() {
      return misses;
    },
    async embed(texts: string[], embedOpts?: { signal?: AbortSignal }): Promise<EmbedResult> {
      const byText = new Map<string, number[]>();
      const pending = new Set<string>();
      for (const text of texts) {
        if (byText.has(text) || pending.has(text)) continue;
        const hit = readCached(text);
        if (hit) byText.set(text, hit);
        else pending.add(text);
      }

      let inputTokens = 0;
      if (pending.size > 0) {
        const missing = [...pending];
        if (!fallback) throw new EmbeddingCacheMissError(missing);

        misses += texts.filter((text) => pending.has(text)).length;
        const fetched = await fallback.embed(missing, embedOpts);
        if (fetched.vectors.length !== missing.length) {
          throw new Error(
            `fallback returned ${fetched.vectors.length} vectors for ${missing.length} texts`,
          );
        }
        for (const [i, text] of missing.entries()) {
          const vector = fetched.vectors[i];
          if (!vector) throw new Error(`fallback returned no vector for text at index ${i}`);
          cache.set(embeddingCacheKey(model, text), encodeVector(vector));
          byText.set(text, vector);
        }
        inputTokens = fetched.inputTokens;
      }

      const out: number[][] = [];
      for (const text of texts) {
        const vector = byText.get(text);
        if (!vector) throw new Error('embedding missing after resolution');
        out.push(vector);
      }
      return { vectors: out, inputTokens };
    },
  };
}
