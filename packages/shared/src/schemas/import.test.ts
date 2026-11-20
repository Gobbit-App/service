import { describe, it, expect } from 'vitest';
import { INGEST_CLIENT_LABEL_MAX } from '../ingest/constants';
import { discardImportRequestSchema, importRequestSchema } from './import';

const row = { type: 'text', title: 'A', body: 'b' };
const parse = (r: object) => importRequestSchema.safeParse({ label: 'x', rows: [r] });

describe('importRequestSchema', () => {
  it('accepts an old body', () => {
    expect(parse(row).success).toBe(true);
  });
  it('accepts strict and unmatched names (049)', () => {
    expect(importRequestSchema.safeParse({ label: 'x', rows: [row], strict: true }).success).toBe(
      true,
    );
    expect(parse({ ...row, unmatched: ['a'] }).success).toBe(true);
  });
  it('rejects media options until US7', () => {
    expect(parse({ ...row, cover: {} }).success).toBe(false);
    expect(parse({ ...row, type: 'media' }).success).toBe(false);
  });
  it('rejects an unknown row key', () => {
    expect(parse({ ...row, nope: 1 }).success).toBe(false);
  });
});

describe('discardImportRequestSchema', () => {
  it('rejects an empty source and trims', () => {
    expect(discardImportRequestSchema.safeParse({ source: '  ' }).success).toBe(false);
    expect(discardImportRequestSchema.parse({ source: ' a ' }).source).toBe('a');
    // Stored labels are cut at INGEST_CLIENT_LABEL_MAX, so a longer source can never match: refuse it.
    expect(
      discardImportRequestSchema.safeParse({ source: 'x'.repeat(INGEST_CLIENT_LABEL_MAX + 1) })
        .success,
    ).toBe(false);
  });
});
