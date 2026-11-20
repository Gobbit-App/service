import { describe, expect, it } from 'vitest';
import { extractionSummarySchema, normalizedSourceSchema } from './ingest';
import { linkPreviewSchema } from './media';
import { LINK_IMAGE_CANDIDATES_MAX } from '../links/constants';

const base = {
  text: 'hello',
  images: [],
  fetch: { status: 200, finalUrl: 'https://e.com/', ms: 10, fallback: 'none' as const },
};

describe('normalizedSourceSchema (041)', () => {
  it('parses pre-041 sources without the builder keys', () => {
    expect(normalizedSourceSchema.parse(base)).toEqual(base);
  });

  it('carries the builder preview and the image candidates', () => {
    const source = {
      ...base,
      linkPreview: { title: 'T', image: 'https://e.com/a.jpg' },
      imageCandidates: ['https://e.com/a.jpg', 'https://e.com/b.jpg'],
    };
    expect(normalizedSourceSchema.parse(source)).toEqual(source);
  });

  it('caps the image candidates', () => {
    const imageCandidates = Array.from(
      { length: LINK_IMAGE_CANDIDATES_MAX + 1 },
      (_, i) => `https://e.com/${i}.jpg`,
    );
    expect(normalizedSourceSchema.safeParse({ ...base, imageCandidates }).success).toBe(false);
  });
});

describe('linkPreviewSchema (D350)', () => {
  it('does not accept the server-owned markers', () => {
    expect(linkPreviewSchema.safeParse({ title: 'T', imageLookup: 1 }).success).toBe(false);
    expect(linkPreviewSchema.safeParse({ title: 'T', imageRemoved: true }).success).toBe(false);
  });
});

describe('extractionSummarySchema fallback and bodyCut (050)', () => {
  const summary = {
    model: 'm',
    escalated: false,
    type: 'text' as const,
    confidence: 0.5,
    language: 'en',
    categoryIds: [],
    newCategory: null,
  };

  it('accepts no_smart_share and bodyCut', () => {
    expect(
      extractionSummarySchema.safeParse({ ...summary, fallback: 'no_smart_share', bodyCut: true })
        .success,
    ).toBe(true);
  });

  it('rejects an unknown fallback', () => {
    expect(extractionSummarySchema.safeParse({ ...summary, fallback: 'nope' }).success).toBe(false);
  });
});
