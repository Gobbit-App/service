import { describe, expect, it } from 'vitest';
import { RRF_K, SUBSTRING_BOOST } from '@pb/shared';
import { type ArmRow, fuseRrf } from './rrf';

const T0 = new Date('2026-01-01T00:00:00Z');
const T1 = new Date('2026-02-01T00:00:00Z');

function row(overrides: Partial<ArmRow> & { id: string }): ArmRow {
  return {
    createdAt: T0,
    textRank: null,
    substring: false,
    vectorRank: null,
    ...overrides,
  };
}

describe('fuseRrf', () => {
  it('scores a text-only row as 1 / (RRF_K + rank)', () => {
    const [out] = fuseRrf([row({ id: 'a', textRank: 1 })], 10);
    expect(out?.id).toBe('a');
    expect(out?.why).toBe('text');
    expect(out?.score).toBeCloseTo(1 / (RRF_K + 1), 12);
  });

  it('scores a semantic-only row as 1 / (RRF_K + rank)', () => {
    const [out] = fuseRrf([row({ id: 'a', vectorRank: 2 })], 10);
    expect(out?.why).toBe('semantic');
    expect(out?.score).toBeCloseTo(1 / (RRF_K + 2), 12);
  });

  it('sums both arms when a row appears in text and vector', () => {
    const [out] = fuseRrf([row({ id: 'a', textRank: 1, vectorRank: 3 })], 10);
    expect(out?.why).toBe('both');
    expect(out?.score).toBeCloseTo(1 / (RRF_K + 1) + 1 / (RRF_K + 3), 12);
  });

  it('adds SUBSTRING_BOOST on a substring hit', () => {
    const [out] = fuseRrf([row({ id: 'a', textRank: 2, substring: true })], 10);
    expect(out?.why).toBe('text');
    expect(out?.score).toBeCloseTo(1 / (RRF_K + 2) + SUBSTRING_BOOST, 12);
  });

  it('keeps a substring-only row as text', () => {
    const [out] = fuseRrf([row({ id: 'a', substring: true })], 10);
    expect(out?.why).toBe('text');
    expect(out?.score).toBeCloseTo(SUBSTRING_BOOST, 12);
  });

  it('drops rows present in neither arm', () => {
    const out = fuseRrf([row({ id: 'gone' }), row({ id: 'kept', vectorRank: 1 })], 10);
    expect(out.map((r) => r.id)).toEqual(['kept']);
  });

  it('breaks score ties by createdAt desc, then id desc', () => {
    const out = fuseRrf(
      [
        row({ id: 'a', textRank: 1, createdAt: T0 }),
        row({ id: 'b', textRank: 1, createdAt: T1 }),
        row({ id: 'c', textRank: 1, createdAt: T0 }),
        row({ id: 'd', textRank: 1, createdAt: T0 }),
      ],
      10,
    );
    expect(out.map((r) => r.id)).toEqual(['b', 'd', 'c', 'a']);
  });

  it('respects the limit', () => {
    const rows = [
      row({ id: 'a', textRank: 1 }),
      row({ id: 'b', textRank: 2 }),
      row({ id: 'c', textRank: 3 }),
    ];
    expect(fuseRrf(rows, 2).map((r) => r.id)).toEqual(['a', 'b']);
    expect(fuseRrf(rows, 0)).toEqual([]);
  });

  it('ranks a both-arm row at (5,5) above a text-only rank-1 row', () => {
    const out = fuseRrf(
      [row({ id: 'textOnly', textRank: 1 }), row({ id: 'both', textRank: 5, vectorRank: 5 })],
      10,
    );
    expect(out.map((r) => r.id)).toEqual(['both', 'textOnly']);
    expect(out[0]?.score).toBeCloseTo(2 / (RRF_K + 5), 12);
  });
});
