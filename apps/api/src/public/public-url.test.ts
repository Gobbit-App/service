import { describe, expect, it } from 'vitest';
import {
  appPath,
  LANDING_JOINED_PATH,
  LANDING_PATH,
  landingUrl,
  openInAppPath,
  publicPath,
  publicUrl,
} from './public-url';

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

  it('D182: search pages keep the query; members go to the app search', () => {
    const target = { kind: 'search', slug: 'our-street', q: 'אמקה & co' } as const;
    expect(publicPath(target)).toBe('/p/our-street/search?q=%D7%90%D7%9E%D7%A7%D7%94%20%26%20co');
    expect(appPath(target)).toBe('/d/our-street/search?q=%D7%90%D7%9E%D7%A7%D7%94%20%26%20co');
    expect(appPath({ kind: 'search', slug: 'our-street', q: '' })).toBe('/d/our-street/search');
  });
});

describe('landing URLs (030)', () => {
  it('the canonical landing URL is the root', () => {
    expect(landingUrl(ORIGIN)).toBe('https://gobbit.example/');
  });

  it('the page and its thanks page live under /welcome', () => {
    expect(LANDING_PATH).toBe('/welcome');
    expect(LANDING_JOINED_PATH).toBe('/welcome/joined');
  });
});
