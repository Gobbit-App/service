import { describe, expect, it } from 'vitest';
import { dedupVerdict, normalizeSourceUrl, type DedupSignals } from './dedup-verdict';

const base: DedupSignals = {
  sourceUrlMatch: null,
  nearest: null,
  titleMatch: null,
  semantic: true,
};

describe('dedupVerdict (Phase 5)', () => {
  it('source URL match wins and yields update via source_url', () => {
    const v = dedupVerdict({
      ...base,
      sourceUrlMatch: 'i1',
      nearest: { itemId: 'i2', similarity: 0.5 },
    });
    expect(v).toEqual({ action: 'update', itemId: 'i1', similarity: null, via: 'source_url' });
  });

  it('semantic nearest 0.95 yields update via vector', () => {
    const v = dedupVerdict({ ...base, nearest: { itemId: 'n1', similarity: 0.95 } });
    expect(v).toEqual({ action: 'update', itemId: 'n1', similarity: 0.95, via: 'vector' });
  });

  it('semantic nearest exactly 0.92 yields update', () => {
    const v = dedupVerdict({ ...base, nearest: { itemId: 'n1', similarity: 0.92 } });
    expect(v.action).toBe('update');
    expect(v.via).toBe('vector');
  });

  it('semantic nearest 0.91 yields possible_duplicate via vector', () => {
    const v = dedupVerdict({ ...base, nearest: { itemId: 'n1', similarity: 0.91 } });
    expect(v).toEqual({
      action: 'possible_duplicate',
      itemId: 'n1',
      similarity: 0.91,
      via: 'vector',
    });
  });

  it('semantic nearest exactly 0.80 yields possible_duplicate', () => {
    const v = dedupVerdict({ ...base, nearest: { itemId: 'n1', similarity: 0.8 } });
    expect(v.action).toBe('possible_duplicate');
    expect(v.via).toBe('vector');
  });

  it('semantic nearest 0.79 yields new via none with similarity 0.79', () => {
    const v = dedupVerdict({ ...base, nearest: { itemId: 'n1', similarity: 0.79 } });
    expect(v).toEqual({ action: 'new', itemId: null, similarity: 0.79, via: 'none' });
  });

  it('semantic with no nearest yields new with null similarity', () => {
    const v = dedupVerdict({ ...base, nearest: null });
    expect(v).toEqual({ action: 'new', itemId: null, similarity: null, via: 'none' });
  });

  it('non-semantic title match 0.85 yields possible_duplicate via title', () => {
    const v = dedupVerdict({
      ...base,
      semantic: false,
      titleMatch: { itemId: 't1', similarity: 0.85 },
    });
    expect(v).toEqual({
      action: 'possible_duplicate',
      itemId: 't1',
      similarity: 0.85,
      via: 'title',
    });
  });

  it('non-semantic title match never yields update', () => {
    const v = dedupVerdict({
      ...base,
      semantic: false,
      titleMatch: { itemId: 't1', similarity: 0.99 },
    });
    expect(v.action).not.toBe('update');
    expect(v.action).toBe('possible_duplicate');
  });

  it('non-semantic title match 0.5 yields new with similarity 0.5', () => {
    const v = dedupVerdict({
      ...base,
      semantic: false,
      titleMatch: { itemId: 't1', similarity: 0.5 },
    });
    expect(v).toEqual({ action: 'new', itemId: null, similarity: 0.5, via: 'none' });
  });

  it('non-semantic ignores nearest 0.99 and yields new', () => {
    const v = dedupVerdict({
      ...base,
      semantic: false,
      nearest: { itemId: 'n1', similarity: 0.99 },
    });
    expect(v).toEqual({ action: 'new', itemId: null, similarity: null, via: 'none' });
  });
});

describe('normalizeSourceUrl (Phase 5)', () => {
  it('lowercases host, drops utm_ and hash, sorts params, strips trailing slash', () => {
    expect(normalizeSourceUrl('https://Example.com/a/?utm_source=x&b=2&a=1#frag')).toBe(
      'https://example.com/a?a=1&b=2',
    );
  });

  it('root path drops trailing slash', () => {
    expect(normalizeSourceUrl('https://example.com/')).toBe('https://example.com');
  });

  it('drops default http port', () => {
    expect(normalizeSourceUrl('http://example.com:80/x')).toBe('http://example.com/x');
  });

  it('strips igshid and trailing slash', () => {
    expect(normalizeSourceUrl('https://www.instagram.com/p/abc/?igshid=zz')).toBe(
      'https://www.instagram.com/p/abc',
    );
  });

  it('strips fbclid and gclid', () => {
    expect(normalizeSourceUrl('https://example.com/p?fbclid=1&gclid=2&q=3')).toBe(
      'https://example.com/p?q=3',
    );
  });

  it('invalid URL is returned trimmed', () => {
    expect(normalizeSourceUrl('not a url ')).toBe('not a url');
  });
});
