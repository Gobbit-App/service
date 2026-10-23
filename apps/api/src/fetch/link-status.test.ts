import { describe, expect, it } from 'vitest';
import { classify, normalizedTitle, sameTitle } from './link-status';

const ok = { error: null };
const err = (error: string) => ({ error });

describe('classify (D164)', () => {
  it('2xx with the same title (or no title to compare) is ok', () => {
    expect(classify(ok, 'Dan the Plumber', 'Dan the Plumber')).toBe('ok');
    expect(classify(ok, null, 'Dan the Plumber')).toBe('ok');
    expect(classify(ok, 'Dan the Plumber', undefined)).toBe('ok');
    expect(classify(ok, null, null)).toBe('ok');
  });

  it('2xx with a different title is changed', () => {
    expect(classify(ok, 'Domain for sale', 'Dan the Plumber')).toBe('changed');
  });

  it('ignores case, spacing, punctuation and a site suffix', () => {
    expect(classify(ok, '  DAN  the plumber!! ', 'Dan the Plumber')).toBe('ok');
    expect(classify(ok, 'Dan the Plumber | Yellow Pages', 'Dan the Plumber')).toBe('ok');
    expect(classify(ok, 'Dan the Plumber', 'Dan the Plumber — Yellow Pages')).toBe('ok');
    expect(classify(ok, 'Dan the Plumber - Site', 'Dan the Plumber · Other')).toBe('ok');
  });

  it.each(['http_404', 'http_410', 'blocked'])('%s is a definite failure', (e) => {
    expect(classify(err(e), null, 'T')).toBe('definite');
  });

  it('DNS not found and connection refused are definite', () => {
    expect(classify(err('fetch_failed: getaddrinfo ENOTFOUND gone.test'), null, null)).toBe(
      'definite',
    );
    expect(classify(err('fetch_failed: connect ECONNREFUSED 1.2.3.4:443'), null, null)).toBe(
      'definite',
    );
  });

  it.each([
    'timeout',
    'http_500',
    'http_503',
    'http_429',
    'http_403',
    'too_many_redirects',
    'fetch_failed: socket hang up',
    'fetch_failed: getaddrinfo EAI_AGAIN x.test',
  ])('%s is temporary', (e) => {
    expect(classify(err(e), null, 'T')).toBe('temporary');
  });
});

describe('sameTitle / normalizedTitle', () => {
  it('does not match unrelated titles that share a site name', () => {
    expect(sameTitle('Plumbers | Site', 'Electricians | Site')).toBe(false);
  });

  it('normalizes and caps the stored title', () => {
    expect(normalizedTitle('  Hello,   World! ', 200)).toBe('hello world');
    expect(normalizedTitle('abcdef', 3)).toBe('abc');
    expect(normalizedTitle('!!!', 10)).toBeNull();
    expect(normalizedTitle(null, 10)).toBeNull();
  });
});
