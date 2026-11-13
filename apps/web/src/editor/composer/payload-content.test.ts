import { describe, expect, it } from 'vitest';
import { emptyDraft, newPayload } from '../draft';
import { payloadHasContent } from './payload-content';

describe('payloadHasContent (D303)', () => {
  it('is false for each type at its start (an untouched sample switches freely)', () => {
    for (const type of ['text', 'link', 'media', 'table', 'calc'] as const) {
      expect(payloadHasContent({ type, payload: newPayload(type) })).toBe(false);
    }
  });

  it('compares against the given start (the reminder start depends on the date)', () => {
    const payload = newPayload('reminder');
    expect(payloadHasContent({ type: 'reminder', payload }, payload)).toBe(false);
  });

  it('ignores the title, body and categories', () => {
    const draft = { ...emptyDraft('link', 'cat-1'), title: 'Recipe', body: 'Notes' };
    expect(payloadHasContent(draft)).toBe(false);
  });

  it('is true once type-specific content is entered', () => {
    const draft = emptyDraft('link', null);
    expect(
      payloadHasContent({ ...draft, payload: { ...draft.payload, url: 'https://example.com' } }),
    ).toBe(true);
  });
});
