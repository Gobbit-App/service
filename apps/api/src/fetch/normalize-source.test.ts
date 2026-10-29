import { describe, expect, it } from 'vitest';
import { INGEST_TEXT_MAX } from '@gobbit/shared';
import { buildNormalizedSource } from './normalize-source';
import type { ExtractedPage } from './extract-page';

function page(over: Partial<ExtractedPage> = {}): ExtractedPage {
  return {
    title: 'Page',
    text: 'Page text',
    og: { title: null, description: null, image: null, siteName: null },
    lang: 'en',
    ...over,
  };
}

describe('buildNormalizedSource (D-normalize)', () => {
  it('skips fetch when there is no url', () => {
    const result = buildNormalizedSource({
      raw: { title: 'T', text: 'shared', images: [] },
      imageUrls: [],
    });
    expect(result.fetch.fallback).toBe('skipped');
    expect(result.fetch.status).toBeNull();
    expect(result.text).toBe('T\n\nshared');
  });

  it('skips fetch when url is present but no fetch outcome is given', () => {
    const result = buildNormalizedSource({
      raw: { url: 'https://example.test/a', text: 'a', images: [] },
      imageUrls: [],
    });
    expect(result.fetch.fallback).toBe('skipped');
    expect(result.fetch.status).toBeNull();
    expect(result.fetch.error).toBeNull();
  });

  it('uses page text when present (fallback none)', () => {
    const result = buildNormalizedSource({
      raw: { text: 'note', url: 'https://example.test/a', images: [] },
      imageUrls: [],
      fetch: {
        status: 200,
        finalUrl: 'https://example.test/final',
        ms: 12,
        page: page(),
      },
    });
    expect(result.fetch.fallback).toBe('none');
    expect(result.text).toBe('note\n\nPage text');
    expect(result.pageTitle).toBe('Page');
    expect(result.lang).toBe('en');
    expect(result.url).toBe('https://example.test/a');
    expect(result.fetch.status).toBe(200);
    expect(result.fetch.finalUrl).toBe('https://example.test/final');
    expect(result.fetch.ms).toBe(12);
    expect(result.fetch.error).toBeNull();
  });

  it('falls back to og title and description when page text is empty', () => {
    const result = buildNormalizedSource({
      raw: { url: 'https://example.test/a', images: [] },
      imageUrls: [],
      fetch: {
        status: 200,
        finalUrl: 'https://example.test/a',
        ms: 3,
        page: page({
          text: '',
          og: { title: 'OG T', description: 'OG D', image: null, siteName: null },
        }),
      },
    });
    expect(result.fetch.fallback).toBe('og');
    expect(result.text).toBe('OG T\n\nOG D');
  });

  it('uses shared text and copies fetch error when page is null', () => {
    const result = buildNormalizedSource({
      raw: { title: 'T', text: 'body', url: 'https://example.test/a', images: [] },
      imageUrls: [],
      fetch: { status: null, finalUrl: null, ms: 5, error: 'timeout', page: null },
    });
    expect(result.fetch.fallback).toBe('shared_text');
    expect(result.fetch.error).toBe('timeout');
    expect(result.text).toBe('T\n\nbody');
  });

  it('passes image urls through', () => {
    const imageUrls = ['https://cdn.example.test/1.jpg', 'https://cdn.example.test/2.png'];
    const result = buildNormalizedSource({
      raw: { text: 'pic', images: [] },
      imageUrls,
    });
    expect(result.images).toEqual(imageUrls);
  });

  it('caps very long text at INGEST_TEXT_MAX', () => {
    const result = buildNormalizedSource({
      raw: {
        text: 'a'.repeat(INGEST_TEXT_MAX),
        url: 'https://example.test/a',
        images: [],
      },
      imageUrls: [],
      fetch: {
        status: 200,
        finalUrl: 'https://example.test/a',
        ms: 1,
        page: page({ text: 'b'.repeat(INGEST_TEXT_MAX) }),
      },
    });
    expect(result.text.length).toBeLessThanOrEqual(INGEST_TEXT_MAX);
  });

  it('omits the url key when raw.url is undefined', () => {
    const result = buildNormalizedSource({
      raw: { text: 'no link', images: [] },
      imageUrls: [],
    });
    expect('url' in result).toBe(false);
  });
});
