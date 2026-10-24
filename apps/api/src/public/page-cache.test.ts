import { describe, expect, it } from 'vitest';
import { createPageCache, pageCacheKey, type CachedPage } from './page-cache';

const page = (html: string): CachedPage => ({ status: 200, html, headers: {} });

describe('page cache (D180)', () => {
  it('returns a stored page until its TTL passes', () => {
    let t = 1_000;
    const cache = createPageCache({ ttlMs: 100, now: () => t });
    cache.set('d1', '/p/a', page('one'));
    expect(cache.get('d1', '/p/a')?.html).toBe('one');
    t += 101;
    expect(cache.get('d1', '/p/a')).toBeUndefined();
  });

  it('purgeDeck hides that deck only', () => {
    const cache = createPageCache();
    cache.set('d1', '/p/a', page('a'));
    cache.set('d2', '/p/b', page('b'));
    cache.purgeDeck('d1');
    expect(cache.get('d1', '/p/a')).toBeUndefined();
    expect(cache.get('d2', '/p/b')?.html).toBe('b');
    cache.set('d1', '/p/a', page('a2'));
    expect(cache.get('d1', '/p/a')?.html).toBe('a2');
  });

  it('keeps at most `max` entries', () => {
    const cache = createPageCache({ max: 2 });
    cache.set('d', '1', page('1'));
    cache.set('d', '2', page('2'));
    cache.set('d', '3', page('3'));
    expect(cache.size).toBe(2);
    expect(cache.get('d', '1')).toBeUndefined();
  });
});

describe('pageCacheKey', () => {
  it('sorts keys and drops undefined values', () => {
    expect(pageCacheKey('/p/a', { view: undefined, cursor: 'x' })).toBe('/p/a?cursor=x');
    expect(pageCacheKey('/p/a', {})).toBe('/p/a');
    expect(pageCacheKey('/p/a', { b: '2', a: '1' })).toBe('/p/a?a=1&b=2');
  });
});
