import { describe, expect, it } from 'vitest';
import { SCREENS, screenFor } from './catalogue';

describe('screen catalogue (D244)', () => {
  it('every pattern uses placeholders only: no $param, query or fragment', () => {
    for (const screen of Object.values(SCREENS)) {
      if (!screen) continue;
      expect(screen.pattern).toMatch(/^\/[a-z:/-]*$/);
      expect(screen.name).not.toBe('');
    }
  });

  it('sign-in, auth error and layouts are not tracked', () => {
    expect(screenFor('/sign-in')).toBeNull();
    expect(screenFor('/auth/error')).toBeNull();
    expect(screenFor('__root__')).toBeNull();
    expect(screenFor(undefined)).toBeNull();
  });

  it('maps route ids to patterns and names', () => {
    expect(screenFor('/i/$itemId_/edit')).toEqual({
      pattern: '/i/:item/edit',
      name: 'Card editor',
    });
    expect(screenFor('/d/$slug/c/$category')).toEqual({
      pattern: '/d/:deck/c/:category',
      name: 'Category',
    });
  });

  it('an unknown id is "Other", never the id itself', () => {
    expect(screenFor('/d/$slug/secret-new-route')).toEqual({ pattern: '/other', name: 'Other' });
  });
});
