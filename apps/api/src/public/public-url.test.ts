import { describe, expect, it } from 'vitest';
import { appPath, openInAppPath, publicPath, publicUrl } from './public-url';

const ORIGIN = 'https://gobbit.example';

describe('public URLs (D177, D178)', () => {
  it('builds deck, category and card paths', () => {
    expect(publicPath({ kind: 'deck', slug: 'our-street' })).toBe('/p/our-street');
    expect(publicPath({ kind: 'category', slug: 'our-street', category: 'emergency' })).toBe(
      '/p/our-street/c/emergency',
    );
    expect(publicUrl(ORIGIN, { kind: 'item', slug: 'our-street', itemId: 'abc' })).toBe(
      'https://gobbit.example/p/our-street/i/abc',
    );
  });

  it('encodes path segments', () => {
    expect(publicPath({ kind: 'category', slug: 'a b', category: 'x/y' })).toBe('/p/a%20b/c/x%2Fy');
  });

  it('maps each page to its app route', () => {
    expect(appPath({ kind: 'deck', slug: 's' })).toBe('/d/s');
    expect(appPath({ kind: 'category', slug: 's', category: 'c' })).toBe('/d/s/c/c');
    expect(appPath({ kind: 'item', slug: 's', itemId: 'i1' })).toBe('/i/i1');
  });

  it('"Open in app" goes through sign-in with next', () => {
    expect(openInAppPath({ kind: 'category', slug: 's', category: 'c' })).toBe(
      '/sign-in?next=%2Fd%2Fs%2Fc%2Fc',
    );
  });
});
