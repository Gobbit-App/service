import { describe, expect, it } from 'vitest';
import { makeDeck } from '../test/fixtures';
import { defaultShareDeck, shareableDecks } from './share-deck';

const me = makeDeck({ id: 'd-me', slug: 'me', role: 'owner' });
const fam = makeDeck({ id: 'd-fam', slug: 'family', role: 'editor' });
const rec = makeDeck({ id: 'd-r', slug: 'recipes', role: 'reader' });
const mnt = makeDeck({ id: 'd-m', slug: 'maint', role: 'maintainer' });

describe('shareableDecks (D108)', () => {
  it('drops reader decks and keeps owner/maintainer/editor in order', () => {
    const result = shareableDecks([me, rec, fam, mnt]);
    expect(result.map((d) => d.slug)).toEqual(['me', 'family', 'maint']);
  });

  it('returns an empty list when every deck is read-only', () => {
    expect(shareableDecks([rec])).toEqual([]);
  });
});

describe('defaultShareDeck', () => {
  it('prefers the requested deck over the last opened one', () => {
    expect(defaultShareDeck([me, fam, rec], 'family', 'me')).toBe('family');
  });

  it('falls back to last when the requested slug is not in the list', () => {
    expect(defaultShareDeck([me, fam, rec], 'nope', 'family')).toBe('family');
  });

  it('falls back to the personal deck when last is not in the list', () => {
    expect(defaultShareDeck([me, fam, rec], undefined, 'gone')).toBe('me');
  });

  it('falls back to the first deck when there is no personal deck', () => {
    expect(defaultShareDeck([fam, rec], undefined, null)).toBe('family');
  });

  it('returns null for an empty list', () => {
    expect(defaultShareDeck([], 'me', 'me')).toBeNull();
  });

  it('defaults to the personal deck when nothing is requested or remembered', () => {
    expect(defaultShareDeck([fam, me], undefined, null)).toBe('me');
  });
});
