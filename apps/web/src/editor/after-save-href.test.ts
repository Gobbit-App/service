import { describe, expect, it, vi } from 'vitest';
import { makeDeck, makeItem } from '../test/fixtures';

vi.mock('../api/client', () => import('../test/api-mock').then((m) => m.clientModule));
const { afterSaveHref } = await import('./use-save-card');

const deck = makeDeck({ slug: 'family' });
const item = makeItem({ id: 'it_1' });

describe('afterSaveHref', () => {
  it('a new card goes to its deck', () => {
    expect(afterSaveHref({ mode: 'create', deck }, null)).toBe('/d/family');
  });

  it('an edit without an opener goes to the card', () => {
    expect(afterSaveHref({ mode: 'edit', deck, item }, null)).toBe('/i/it_1');
  });

  it('an edit goes back to the page that opened it (D320)', () => {
    const opener = '/d/family/browse?c=all&i=it_1';
    expect(afterSaveHref({ mode: 'edit', deck, item, opener }, null)).toBe(opener);
  });

  it('a proposal edited from review goes back to the queue', () => {
    const proposal = makeItem({ id: 'it_1', status: 'proposed' });
    expect(
      afterSaveHref({ mode: 'edit', deck, item: proposal, from: 'review', opener: '/d/x' }, null),
    ).toBe('/d/family/review');
  });
});
