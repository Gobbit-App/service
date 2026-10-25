import { describe, expect, it } from 'vitest';
import { backTarget, DECK_LIST_HREF } from './back-target';

describe('backTarget', () => {
  it('has no target on the deck list', () => {
    expect(backTarget({ kind: 'home' })).toBeNull();
  });

  it('sends top-level screens and deck screens to the deck list', () => {
    expect(backTarget({ kind: 'top' })).toBe(DECK_LIST_HREF);
    expect(backTarget({ kind: 'deck' })).toBe(DECK_LIST_HREF);
  });

  it('sends a new card and a card page to their deck', () => {
    expect(backTarget({ kind: 'new-card', deckSlug: 'family' })).toBe('/d/family');
    expect(backTarget({ kind: 'card', deckSlug: 'family' })).toBe('/d/family');
  });

  it('uses the deck id for a card before its deck loads', () => {
    expect(backTarget({ kind: 'card', deckSlug: 'dk_123' })).toBe('/d/dk_123');
  });

  it('sends the editor to the card it edits', () => {
    expect(backTarget({ kind: 'edit', itemId: 'it_1', deckSlug: 'family' })).toBe('/i/it_1');
  });

  it('sends the editor opened from review back to the review queue', () => {
    expect(backTarget({ kind: 'edit', itemId: 'it_1', deckSlug: 'family', from: 'review' })).toBe(
      '/d/family/review',
    );
  });

  it('encodes slugs and ids', () => {
    expect(backTarget({ kind: 'card', deckSlug: 'a b' })).toBe('/d/a%20b');
    expect(backTarget({ kind: 'edit', itemId: 'a/b', deckSlug: 'x' })).toBe('/i/a%2Fb');
  });
});
