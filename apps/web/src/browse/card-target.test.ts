import { describe, expect, it } from 'vitest';
import { cardTarget } from './card-target';

const address = { c: 'main', i: 'card-22' };

describe('cardTarget', () => {
  it("opens the address's category on its i and others on their first card", () => {
    expect(cardTarget('main', address, null)).toBe('card-22');
    expect(cardTarget('other', address, null)).toBeUndefined();
  });

  it('opens the category being left on its first card before the address catches up', () => {
    const pending = { to: 'other', cards: { main: undefined } };
    expect(cardTarget('main', address, pending)).toBeUndefined();
    expect(cardTarget('other', address, pending)).toBeUndefined();
  });

  it("opens a jump's target on the requested card before the address catches up", () => {
    const pending = { to: 'other', cards: { other: 'card-3', main: undefined } };
    expect(cardTarget('other', address, pending)).toBe('card-3');
    expect(cardTarget('main', address, pending)).toBeUndefined();
  });

  it('ignores the pending targets once the address has arrived', () => {
    const pending = { to: 'main', cards: { main: undefined } };
    expect(cardTarget('main', address, pending)).toBe('card-22');
  });

  it('leaves categories the move does not list to the address', () => {
    const pending = { to: 'other', cards: { general: undefined } };
    expect(cardTarget('main', address, pending)).toBe('card-22');
  });
});
