import { afterEach, describe, expect, it } from 'vitest';
import { currentReturnPath, safeReturnPath } from './return-path';

describe('safeReturnPath', () => {
  it('accepts deck pages, with their search', () => {
    expect(safeReturnPath('/d/family')).toBe('/d/family');
    expect(safeReturnPath('/d/family/browse?c=all&i=it_1')).toBe('/d/family/browse?c=all&i=it_1');
    expect(safeReturnPath('/d/family/c/recipes')).toBe('/d/family/c/recipes');
    expect(safeReturnPath('/d/family?x=1')).toBe('/d/family?x=1');
  });

  it('accepts a card page', () => {
    expect(safeReturnPath('/i/it_1')).toBe('/i/it_1');
  });

  it('rejects the editor, other app pages and anything off-site', () => {
    for (const value of [
      '/i/it_1/edit',
      '/',
      '/settings',
      '/d/',
      '//evil.example/d/x',
      'https://evil.example/d/x',
      '/sign-in?next=/d/x',
      '/d/x\n',
      42,
      undefined,
    ]) {
      expect(safeReturnPath(value)).toBeNull();
    }
  });
});

describe('currentReturnPath', () => {
  afterEach(() => window.history.replaceState(null, '', '/'));

  it('reads the current deck page', () => {
    window.history.replaceState(null, '', '/d/family/browse?c=all&i=it_1');
    expect(currentReturnPath()).toBe('/d/family/browse?c=all&i=it_1');
  });

  it('is null outside a deck or card page', () => {
    window.history.replaceState(null, '', '/settings');
    expect(currentReturnPath()).toBeNull();
  });
});
