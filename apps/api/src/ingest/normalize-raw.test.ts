import { describe, expect, it, vi } from 'vitest';
import type { IngestRaw } from '@gobbit/shared';
import { ARTICLE_PAGE, OG_ONLY_PAGE } from '@gobbit/db/test/ingest-pages';
import type { SafeFetch, SafeFetchResult } from '../fetch/safe-fetch';
import { normalizeRaw } from './normalize-raw';

const imageUrl = (publicId: string) => `https://res.example/${publicId}.jpg`;

function fetchReturning(result: Partial<SafeFetchResult>): SafeFetch {
  return vi.fn(async (url: string) => ({
    status: 200,
    finalUrl: url,
    ms: 12,
    html: null,
    error: null,
    ...result,
  }));
}

describe('normalizeRaw (D102)', () => {
  it('skips fetching without a url and keeps the shared text and image urls', async () => {
    const safeFetch = fetchReturning({});
    const raw: IngestRaw = {
      text: 'Plumber 050-1234567',
      images: [{ publicId: 'gobbit/ingest/d/1', bytes: 10, mime: 'image/png' }],
    };
    const out = await normalizeRaw(raw, { safeFetch, imageUrl });
    expect(safeFetch).not.toHaveBeenCalled();
    expect(out.text).toBe('Plumber 050-1234567');
    expect(out.images).toEqual(['https://res.example/gobbit/ingest/d/1.jpg']);
    expect(out.fetch.fallback).toBe('skipped');
  });

  it('uses the readable page text when the fetch succeeds', async () => {
    const out = await normalizeRaw(
      { url: 'https://dan.example/', images: [] },
      { safeFetch: fetchReturning({ html: ARTICLE_PAGE }), imageUrl },
    );
    expect(out.fetch).toMatchObject({ status: 200, fallback: 'none', error: null });
    expect(out.text).toContain('050-123-4567');
    expect(out.og?.title).toBe('Dan the Plumber');
    expect(out.url).toBe('https://dan.example/');
  });

  it('falls back to OG tags for an OG-only page', async () => {
    const out = await normalizeRaw(
      { url: 'https://instagram.example/p/1', images: [] },
      { safeFetch: fetchReturning({ html: OG_ONLY_PAGE }), imageUrl },
    );
    expect(out.fetch.fallback).toBe('og');
    expect(out.text).toContain('Best shakshuka in Tel Aviv');
  });

  it('falls back to the shared text when the fetch is blocked', async () => {
    const out = await normalizeRaw(
      { url: 'http://169.254.169.254/', text: 'look at this', images: [] },
      { safeFetch: fetchReturning({ status: null, error: 'blocked' }), imageUrl },
    );
    expect(out.fetch).toMatchObject({ fallback: 'shared_text', error: 'blocked' });
    expect(out.text).toBe('look at this');
  });
});
