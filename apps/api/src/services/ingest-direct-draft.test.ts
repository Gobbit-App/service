import { describe, expect, it } from 'vitest';
import { CARD_BODY_MAX, NAME_MAX } from '@gobbit/shared';
import { HttpError } from '../errors/http-errors';
import { parseDirectDraft, suggestedCategory, type DirectDraft } from './ingest.service';

/** Runs fn and returns what it threw as { status, detail }; fails the test if nothing threw. */
function thrown(fn: () => unknown): { status: unknown; detail: string } {
  try {
    fn();
  } catch (err) {
    if (!(err instanceof HttpError)) throw err;
    return { status: err.status, detail: err.detail ?? '' };
  }
  throw new Error('expected to throw');
}

describe('ingest.service direct drafts (D100)', () => {
  it('parseDirectDraft keeps the card and drops newCategory', () => {
    const card = parseDirectDraft({
      type: 'text',
      title: 'Soup',
      body: 'Hot',
      payload: {},
      newCategory: 'Food',
    });
    expect(card.type).toBe('text');
    expect(card.title).toBe('Soup');
    expect('newCategory' in card).toBe(false);
  });

  it('parseDirectDraft rejects a calc card with 400 naming the allowed types', () => {
    const draft = { type: 'calc', title: 'Totals', payload: {} } as unknown as DirectDraft;
    const err = thrown(() => parseDirectDraft(draft));
    expect(err.status).toBe(400);
    expect(err.detail).toContain('text');
  });

  it('parseDirectDraft rejects an empty title with 400', () => {
    const err = thrown(() => parseDirectDraft({ type: 'text', title: '', body: 'x', payload: {} }));
    expect(err.status).toBe(400);
  });

  it('parseDirectDraft rejects a body over CARD_BODY_MAX code points with 400', () => {
    // Each emoji is one code point but two UTF-16 units, so length alone would not catch this.
    const body = '😀'.repeat(CARD_BODY_MAX + 1);
    const err = thrown(() => parseDirectDraft({ type: 'text', title: 'Soup', body, payload: {} }));
    expect(err.status).toBe(400);
  });

  it('suggestedCategory returns null for missing or blank names', () => {
    expect(suggestedCategory(undefined)).toBeNull();
    expect(suggestedCategory(null)).toBeNull();
    expect(suggestedCategory('   ')).toBeNull();
  });

  it('suggestedCategory trims the name', () => {
    expect(suggestedCategory('  Food  ')).toBe('Food');
  });

  it('suggestedCategory rejects a name over NAME_MAX with 400', () => {
    const err = thrown(() => suggestedCategory('a'.repeat(NAME_MAX + 1)));
    expect(err.status).toBe(400);
  });

  it('suggestedCategory returns a name of exactly NAME_MAX unchanged', () => {
    const name = 'a'.repeat(NAME_MAX);
    expect(suggestedCategory(name)).toBe(name);
  });
});
