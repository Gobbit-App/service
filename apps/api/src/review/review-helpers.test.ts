import { describe, expect, it } from 'vitest';
import {
  SOURCE_PREVIEW_CHARS,
  dedupTargetId,
  mergeProposalPatch,
  sourcePreview,
} from './review-helpers';

describe('sourcePreview', () => {
  it('returns raw.url when present even if text exists', () => {
    const job = {
      raw: { url: 'https://raw.example/a', text: 'hello' },
      normalized: null,
    };
    expect(sourcePreview(job as never)).toBe('https://raw.example/a');
  });

  it('falls back to normalized.url when raw is null', () => {
    const job = {
      raw: null,
      normalized: { url: 'https://norm.example/b', text: 'hello' },
    };
    expect(sourcePreview(job as never)).toBe('https://norm.example/b');
  });

  it('collapses whitespace runs and trims text when there is no url', () => {
    const job = { raw: { text: '  a \n\n b  ' }, normalized: null };
    expect(sourcePreview(job as never)).toBe('a b');
  });

  it('cuts text longer than SOURCE_PREVIEW_CHARS to exactly that many code points ending with …', () => {
    const job = { raw: { text: 'x'.repeat(SOURCE_PREVIEW_CHARS + 10) }, normalized: null };
    const result = sourcePreview(job as never);
    expect(result).not.toBeNull();
    expect([...(result ?? '')].length).toBe(SOURCE_PREVIEW_CHARS);
    expect(result?.endsWith('…')).toBe(true);
  });

  it('counts code points rather than UTF-16 units', () => {
    const text = '😀'.repeat(SOURCE_PREVIEW_CHARS);
    const job = { raw: { text }, normalized: null };
    expect(sourcePreview(job as never)).toBe(text);
  });

  it('returns null when raw and normalized are both null, or text is only whitespace', () => {
    expect(sourcePreview({ raw: null, normalized: null } as never)).toBeNull();
    expect(sourcePreview({ raw: { text: ' \n\t ' }, normalized: null } as never)).toBeNull();
  });
});

describe('dedupTargetId', () => {
  it('returns null for null and undefined', () => {
    expect(dedupTargetId(null)).toBeNull();
    expect(dedupTargetId(undefined)).toBeNull();
  });

  it('returns null for a new verdict', () => {
    expect(
      dedupTargetId({ action: 'new', itemId: null, similarity: null, via: 'none' }),
    ).toBeNull();
  });

  it('returns the itemId for update and possible_duplicate verdicts', () => {
    expect(
      dedupTargetId({ action: 'update', itemId: 'item-1', similarity: null, via: 'source_url' }),
    ).toBe('item-1');
    expect(
      dedupTargetId({
        action: 'possible_duplicate',
        itemId: 'item-2',
        similarity: 0.85,
        via: 'vector',
      }),
    ).toBe('item-2');
  });
});

describe('mergeProposalPatch', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  const proposal = {
    type: 'link',
    title: 'New',
    body: 'b',
    payload: { url: 'https://a.example/' },
    entities: { phones: ['1'] },
    sourceUrl: 'https://a.example/',
  } as never;

  it('copies the payload when both cards have the same type', () => {
    const result = mergeProposalPatch(proposal, { type: 'link', sourceUrl: null } as never, now);
    expect(result).toEqual({
      title: 'New',
      body: 'b',
      entities: { phones: ['1'] },
      sourceUrl: 'https://a.example/',
      status: 'published',
      verifiedAt: now,
      payload: { url: 'https://a.example/' },
    });
  });

  it('omits the payload when the target type differs', () => {
    const result = mergeProposalPatch(proposal, { type: 'text', sourceUrl: null } as never, now);
    expect('payload' in result).toBe(false);
  });

  it('keeps the target sourceUrl when the proposal has none', () => {
    const noUrl = { ...(proposal as object), sourceUrl: null } as never;
    const result = mergeProposalPatch(
      noUrl,
      { type: 'link', sourceUrl: 'https://old.example/' } as never,
      now,
    );
    expect(result.sourceUrl).toBe('https://old.example/');
  });
});
