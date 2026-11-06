import { describe, expect, it, vi } from 'vitest';
import { LINK_ARTICLE_IMAGE_MIN_PX, type IngestRaw } from '@gobbit/shared';
import { ARTICLE_PAGE, OG_ONLY_PAGE } from '@gobbit/db/test/ingest-pages';
import { buildLinkPreview } from '../fetch/build-preview';
import { extractPage } from '../fetch/extract-page';
import { PREVIEW_EVENTS } from '../fetch/preview-events';
import type { SafeFetch, SafeFetchResult } from '../fetch/safe-fetch';
import type { Logger } from '../lib/logger';
import { normalizeRaw, type NormalizeDeps } from './normalize-raw';

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

function deps(safeFetch: SafeFetch, log?: Logger): NormalizeDeps {
  return {
    buildPreview: (url, previewLog) =>
      buildLinkPreview(
        {
          safeFetch,
          fetchJson: null,
          extract: extractPage,
          articleMinPx: LINK_ARTICLE_IMAGE_MIN_PX,
        },
        url,
        previewLog,
      ),
    imageUrl,
    log,
  };
}

function fakeLog() {
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() };
  log.child.mockReturnValue(log);
  return log;
}

describe('normalizeRaw (D102, D346)', () => {
  it('skips fetching without a url and keeps the shared text and image urls', async () => {
    const safeFetch = fetchReturning({});
    const raw: IngestRaw = {
      text: 'Plumber 050-1234567',
      images: [{ publicId: 'gobbit/ingest/d/1', bytes: 10, mime: 'image/png' }],
    };
    const out = await normalizeRaw(raw, deps(safeFetch));
    expect(safeFetch).not.toHaveBeenCalled();
    expect(out.text).toBe('Plumber 050-1234567');
    expect(out.images).toEqual(['https://res.example/gobbit/ingest/d/1.jpg']);
    expect(out.fetch.fallback).toBe('skipped');
    expect(out.imageCandidates).toBeUndefined();
  });

  it('uses the readable page text and carries the preview and candidates', async () => {
    const out = await normalizeRaw(
      { url: 'https://dan.example/', images: [] },
      deps(fetchReturning({ html: ARTICLE_PAGE })),
    );
    expect(out.fetch).toMatchObject({ status: 200, fallback: 'none', error: null });
    expect(out.text).toContain('050-123-4567');
    expect(out.og?.title).toBe('Dan the Plumber');
    expect(out.url).toBe('https://dan.example/');
    expect(out.linkPreview?.title).toBe('Dan the Plumber');
    expect(Array.isArray(out.imageCandidates)).toBe(true);
  });

  it('falls back to OG tags for an OG-only page', async () => {
    const out = await normalizeRaw(
      { url: 'https://instagram.example/p/1', images: [] },
      deps(fetchReturning({ html: OG_ONLY_PAGE })),
    );
    expect(out.fetch.fallback).toBe('og');
    expect(out.text).toContain('Best shakshuka in Tel Aviv');
  });

  it('falls back to the shared text when the fetch is blocked', async () => {
    const out = await normalizeRaw(
      { url: 'http://169.254.169.254/', text: 'look at this', images: [] },
      deps(fetchReturning({ status: null, error: 'blocked' })),
    );
    expect(out.fetch).toMatchObject({ fallback: 'shared_text', error: 'blocked' });
    expect(out.text).toBe('look at this');
    expect(out.linkPreview).toBeUndefined();
    expect(out.imageCandidates).toEqual([]);
  });

  it('logs link_preview.built for the ingest job', async () => {
    const log = fakeLog();
    await normalizeRaw(
      { url: 'https://dan.example/', images: [] },
      deps(fetchReturning({ html: ARTICLE_PAGE }), log as unknown as Logger),
      { jobId: 'j1', deckId: 'd1' },
    );
    expect(log.child).toHaveBeenCalledWith({ caller: 'ingest', jobId: 'j1', deckId: 'd1' });
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({ event: PREVIEW_EVENTS.built, caller: 'ingest' }),
      expect.any(String),
    );
  });
});
