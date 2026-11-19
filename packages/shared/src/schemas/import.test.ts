import { describe, it, expect } from 'vitest';
import { discardImportRequestSchema, importRequestSchema } from './import';

const row = { type: 'text', title: 'A', body: 'b' };
const parse = (r: object) => importRequestSchema.safeParse({ label: 'x', rows: [r] });

describe('importRequestSchema', () => {
  it('accepts an old body without strict or unmatched', () => {
    const r = importRequestSchema.parse({ label: 'x', rows: [row] });
    expect(r.strict).toBe(false);
    expect(r.rows[0]?.unmatched).toBeUndefined();
  });
  it('rejects more than 5 unmatched names', () => {
    const unmatched = ['a', 'b', 'c', 'd', 'e', 'f'];
    expect(parse({ ...row, unmatched }).success).toBe(false);
    expect(parse({ ...row, unmatched: unmatched.slice(1) }).success).toBe(true);
  });
  it('rejects an unknown row key', () => {
    expect(parse({ ...row, nope: 1 }).success).toBe(false);
  });
});

describe('discardImportRequestSchema', () => {
  it('rejects an empty source and trims', () => {
    expect(discardImportRequestSchema.safeParse({ source: '  ' }).success).toBe(false);
    expect(discardImportRequestSchema.parse({ source: ' a ' }).source).toBe('a');
  });
});
