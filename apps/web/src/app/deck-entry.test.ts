import { describe, expect, it } from 'vitest';
import { deckEntryHref, opensInBrowse } from './deck-entry';

describe('deck entry', () => {
  it('opens the list for roles that run the deck', () => {
    expect(opensInBrowse('owner')).toBe(false);
    expect(opensInBrowse('maintainer')).toBe(false);
    expect(deckEntryHref({ slug: 'family', role: 'owner' })).toBe('/d/family');
    expect(deckEntryHref({ slug: 'family', role: 'maintainer' })).toBe('/d/family');
  });

  it('opens Browse of all cards for editors and readers', () => {
    expect(opensInBrowse('editor')).toBe(true);
    expect(opensInBrowse('reader')).toBe(true);
    expect(deckEntryHref({ slug: 'family', role: 'editor' })).toBe('/d/family/browse?c=all');
    expect(deckEntryHref({ slug: 'family', role: 'reader' })).toBe('/d/family/browse?c=all');
  });

  it('encodes the slug', () => {
    expect(deckEntryHref({ slug: 'a b', role: 'reader' })).toBe('/d/a%20b/browse?c=all');
  });
});
