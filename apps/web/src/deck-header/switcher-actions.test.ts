import { describe, expect, it } from 'vitest';
import { makeCategory, makeDeck } from '../test/fixtures';
import { categorySwitchActions, deckSwitchActions } from './switcher-actions';

describe('deckSwitchActions', () => {
  const decks = [
    makeDeck({ id: 'd1', slug: 'family', name: 'Family' }),
    makeDeck({ id: 'd2', slug: 'me', name: 'Niran' }),
  ];

  it('lists every deck, checks the current one, and ends with All decks', () => {
    const actions = deckSwitchActions(decks, 'me');
    expect(actions.map((a) => [a.label, a.href, a.checked])).toEqual([
      ['Family', '/d/family', false],
      ['Niran', '/d/me', true],
      ['All decks', '/?all=true', undefined],
    ]);
  });

  it('still offers All decks before the deck list loads', () => {
    expect(deckSwitchActions([], 'me').map((a) => a.key)).toEqual(['all-decks']);
  });
});

describe('categorySwitchActions', () => {
  const categories = [
    makeCategory({ name: 'General', slug: 'general', position: 0, isDefault: true }),
    makeCategory({ name: 'Links', slug: 'links-cat', position: 1, isDefault: false }),
  ];

  it('links each view and checks the active one', () => {
    const actions = categorySwitchActions(
      'family',
      categories,
      { kind: 'category', slug: 'links-cat' },
      { showArchived: true, showLinks: false },
    );
    expect(actions.map((a) => [a.label, a.href, a.checked])).toEqual([
      ['All', '/d/family', false],
      ['Favorites', '/d/family/favorites', false],
      ['General', '/d/family/c/general', false],
      ['Links', '/d/family/c/links-cat', true],
      ['Archived', '/d/family/archived', false],
    ]);
  });

  it('checks nothing on search results', () => {
    const actions = categorySwitchActions('family', categories, null, {
      showArchived: false,
      showLinks: false,
    });
    expect(actions.some((a) => a.checked)).toBe(false);
  });
});
