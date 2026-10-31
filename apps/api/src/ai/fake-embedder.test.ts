import { describe, expect, it } from 'vitest';
import { EMBEDDING_DIMS } from '@gobbit/shared';
import { axisVector, blendVectors, createFakeEmbedder } from './fake-embedder';

function norm(v: number[]): number {
  return Math.sqrt(v.reduce((s, x) => s + x * x, 0));
}

describe('createFakeEmbedder', () => {
  it('returns identical vectors for the same text', async () => {
    const e = createFakeEmbedder({ dims: 16 });
    const { vectors } = await e.embed(['hello', 'hello']);
    expect(vectors[0]).toEqual(vectors[1]);
  });

  it('returns different vectors for different texts', async () => {
    const e = createFakeEmbedder({ dims: 16 });
    const { vectors } = await e.embed(['hello', 'world']);
    expect(vectors[0]).not.toEqual(vectors[1]);
  });

  it('returns unit-length vectors', async () => {
    const e = createFakeEmbedder({ dims: 64 });
    const { vectors } = await e.embed(['alpha', 'beta gamma', 'שלום', 'Καλημέρα']);
    for (const v of vectors) {
      expect(Math.abs(norm(v) - 1)).toBeLessThan(1e-6);
    }
  });

  it('respects the dims option', async () => {
    const e = createFakeEmbedder({ dims: 24 });
    expect(e.dims).toBe(24);
    const { vectors } = await e.embed(['x']);
    expect(vectors[0]).toHaveLength(24);
  });

  it('defaults to EMBEDDING_DIMS and the fake provider/model', () => {
    const e = createFakeEmbedder();
    expect(e.dims).toBe(EMBEDDING_DIMS);
    expect(e.provider).toBe('fake');
    expect(e.model).toBe('fake-embedding');
  });

  it('returns overrides as given, as copies', async () => {
    const override = [0.5, 0.5, 0, 0];
    const e = createFakeEmbedder({ dims: 4, overrides: { special: override } });
    const { vectors } = await e.embed(['special']);
    expect(vectors[0]).toEqual([0.5, 0.5, 0, 0]);
    expect(vectors[0]).not.toBe(override);
  });

  it('records each call as a copy of the texts', async () => {
    const e = createFakeEmbedder({ dims: 8 });
    const first = ['a', 'b'];
    await e.embed(first);
    await e.embed(['c']);
    first.push('mutated');
    expect(e.calls).toEqual([['a', 'b'], ['c']]);
  });

  it('counts input tokens as ceil(length / 4) summed', async () => {
    const e = createFakeEmbedder({ dims: 8 });
    const { inputTokens } = await e.embed(['abcde', 'abcd', '']);
    expect(inputTokens).toBe(2 + 1 + 0);
  });
});

describe('axisVector', () => {
  it('has a single 1 at the given axis', () => {
    const v = axisVector(4, 2);
    expect(v).toEqual([0, 0, 1, 0]);
  });

  it('is all zeros for an out-of-range axis', () => {
    expect(axisVector(3, 5)).toEqual([0, 0, 0]);
    expect(axisVector(3, -1)).toEqual([0, 0, 0]);
  });
});

describe('blendVectors', () => {
  it('returns a normalized weighted sum', () => {
    const out = blendVectors([
      { vector: axisVector(4, 0), weight: 1 },
      { vector: axisVector(4, 1), weight: 1 },
    ]);
    const s = 1 / Math.sqrt(2);
    expect(out[0]).toBeCloseTo(s, 6);
    expect(out[1]).toBeCloseTo(s, 6);
    expect(out[2]).toBe(0);
    expect(out[3]).toBe(0);
    expect(Math.abs(norm(out) - 1)).toBeLessThan(1e-6);
  });

  it('is dominated by the heavier weight', () => {
    const out = blendVectors([
      { vector: axisVector(3, 0), weight: 3 },
      { vector: axisVector(3, 1), weight: 1 },
    ]);
    expect(out[0] ?? 0).toBeGreaterThan(out[1] ?? 0);
    expect(Math.abs(norm(out) - 1)).toBeLessThan(1e-6);
  });

  it('returns an empty array for no parts', () => {
    expect(blendVectors([])).toEqual([]);
  });

  it('throws on mismatched vector lengths', () => {
    expect(() =>
      blendVectors([
        { vector: [1, 0], weight: 1 },
        { vector: [1, 0, 0], weight: 1 },
      ]),
    ).toThrow(/length mismatch/);
  });
});
