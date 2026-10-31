import { createHash } from 'node:crypto';
import { EMBEDDING_DIMS } from '@gobbit/shared';
import type { Embedder } from './embedder';

/** Unit vector of `dims` with 1 at `axis` (tests build orthogonal "meanings"). */
export function axisVector(dims: number, axis: number): number[] {
  const v = new Array<number>(dims).fill(0);
  if (axis >= 0 && axis < dims) v[axis] = 1;
  return v;
}

/** Normalized weighted sum of vectors (all same length). */
export function blendVectors(parts: { vector: number[]; weight: number }[]): number[] {
  const first = parts[0];
  if (!first) return [];
  const out = new Array<number>(first.vector.length).fill(0);
  for (const { vector, weight } of parts) {
    if (vector.length !== out.length) throw new Error('blendVectors: vector length mismatch');
    for (let i = 0; i < out.length; i++) {
      out[i] = (out[i] ?? 0) + weight * (vector[i] ?? 0);
    }
  }
  return normalize(out);
}

function normalize(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  if (norm === 0) return v.slice();
  return v.map((x) => x / norm);
}

function hashVector(text: string, dims: number): number[] {
  const bytes: number[] = [];
  for (let counter = 0; bytes.length < dims; counter++) {
    const digest = createHash('sha256').update(`${counter}:${text}`).digest();
    for (const b of digest) bytes.push(b);
  }
  return normalize(bytes.slice(0, dims).map((b) => (b / 255) * 2 - 1));
}

/** Deterministic embedder for tests: exact-text overrides, else a unit vector derived from sha256(text). */
export function createFakeEmbedder(
  opts: { dims?: number; model?: string; overrides?: Record<string, number[]> } = {},
): Embedder & { calls: string[][] } {
  const dims = opts.dims ?? EMBEDDING_DIMS;
  const model = opts.model ?? 'fake-embedding';
  const overrides = opts.overrides ?? {};
  const calls: string[][] = [];
  return {
    provider: 'fake',
    model,
    dims,
    calls,
    async embed(texts: string[]) {
      calls.push([...texts]);
      const vectors = texts.map((t) => {
        const o = Object.hasOwn(overrides, t) ? overrides[t] : undefined;
        return o !== undefined ? [...o] : hashVector(t, dims);
      });
      const inputTokens = texts.reduce((s, t) => s + Math.ceil(t.length / 4), 0);
      return { vectors, inputTokens };
    },
  };
}
