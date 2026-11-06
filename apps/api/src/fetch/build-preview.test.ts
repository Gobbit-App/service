import { describe, expect, it, vi } from 'vitest';
import { LINK_ARTICLE_IMAGE_MIN_PX, LINK_IMAGE_CANDIDATES_MAX } from '@gobbit/shared';
import { buildLinkPreview, logPreviewBuilt, type BuildDeps } from './build-preview';
import { extractPage } from './extract-page';
import { PREVIEW_EVENTS, previewOutcomes, previewReasons } from './preview-events';
import type { SafeFetchResult, SafeJsonFetch, SafeJsonFetchResult } from './safe-fetch';

function htmlPage(head: string, body = '<p>Some page text.</p>'): string {
  return `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;
}

function fetched(html: string | null, over: Partial<SafeFetchResult> = {}): SafeFetchResult {
  return { status: 200, finalUrl: null, ms: 3, html, error: null, ...over };
}

function deps(
  over: Partial<BuildDeps> & { html?: string | null; fetchError?: string } = {},
): BuildDeps {
  const { html = null, fetchError, ...rest } = over;
  return {
    safeFetch: async () =>
      fetchError ? fetched(null, { status: null, error: fetchError }) : fetched(html),
    fetchJson: null,
    extract: extractPage,
    articleMinPx: LINK_ARTICLE_IMAGE_MIN_PX,
    ...rest,
  };
}

function jsonAnswer(json: unknown, error: string | null = null): SafeJsonFetch {
  return vi.fn(async (): Promise<SafeJsonFetchResult> => ({ status: 200, ms: 1, json, error }));
}

describe('buildLinkPreview (D346)', () => {
  it('builds title, description and the first candidate as the image', async () => {
    const html = htmlPage(
      `<title>Tag title</title>
       <meta property="og:title" content="OG title">
       <meta property="og:description" content="About it">
       <meta property="og:image" content="/og.jpg">
       <meta name="twitter:image" content="https://cdn.test/tw.jpg">`,
    );
    const build = await buildLinkPreview(deps({ html }), 'https://site.test/a');
    expect(build.preview).toEqual({
      title: 'OG title',
      description: 'About it',
      image: 'https://site.test/og.jpg',
    });
    expect(build.candidates).toEqual(['https://site.test/og.jpg', 'https://cdn.test/tw.jpg']);
    expect(build.page?.text).toContain('Some page text');
    expect(build.decision).toMatchObject({
      outcome: 'preview',
      host: 'site.test',
      lockedHost: null,
      imageSource: 'og',
      titleSource: 'og',
      lookup: 'skipped',
    });
  });

  it('falls back to a later source when og:image is missing', async () => {
    const html = htmlPage(
      `<title>Recipe</title><link rel="image_src" href="https://cdn.test/src.jpg">`,
    );
    const build = await buildLinkPreview(deps({ html }), 'https://site.test/a');
    expect(build.preview).toEqual({ title: 'Recipe', image: 'https://cdn.test/src.jpg' });
    expect(build.decision).toMatchObject({ imageSource: 'image_src', titleSource: 'title_tag' });
  });

  it('reports a fetch failure as none/fetch_failed and keeps the fetch outcome', async () => {
    const build = await buildLinkPreview(deps({ fetchError: 'timeout' }), 'https://site.test/a');
    expect(build).toMatchObject({
      page: null,
      preview: null,
      candidates: [],
      fetch: { error: 'timeout', status: null },
      decision: { outcome: 'none', reason: 'fetch_failed' },
    });
  });

  it('reports a page with nothing to show as none/nothing', async () => {
    const build = await buildLinkPreview(deps({ html: htmlPage('') }), 'https://site.test/a');
    expect(build.decision).toMatchObject({ outcome: 'none', reason: 'nothing' });
  });

  it('never throws when the fetch or the extractor throws', async () => {
    const throwing = await buildLinkPreview(
      deps({
        safeFetch: async () => {
          throw new Error('socket');
        },
      }),
      'https://site.test/a',
    );
    expect(throwing.decision).toMatchObject({ outcome: 'none', reason: 'fetch_failed' });
    expect(throwing.fetch.error).toMatch(/^fetch_failed/);

    const badExtract = await buildLinkPreview(
      deps({
        html: '<html>',
        extract: () => {
          throw new Error('parse');
        },
      }),
      'https://site.test/a',
    );
    expect(badExtract.decision.outcome).toBe('none');
  });

  describe('locked hosts (D347)', () => {
    it.each([
      ['Instagram', 'generic'],
      ['Log in • Instagram', 'login_wall'],
      ["Sorry, this page isn't available. • Instagram", 'unavailable'],
    ])('discards %j whole as %s', async (title, reason) => {
      const html = htmlPage(
        `<meta property="og:title" content="${title}">
         <meta property="og:description" content="Log in to see photos">
         <meta property="og:image" content="https://static.test/logo.png">`,
      );
      const build = await buildLinkPreview(deps({ html }), 'https://www.instagram.com/p/abc/');
      expect(build.preview).toBeNull();
      expect(build.candidates).toEqual([]);
      expect(build.decision).toMatchObject({
        outcome: 'discarded',
        reason,
        host: 'instagram.com',
        lockedHost: 'Instagram',
      });
    });

    it('uses a real locked-host preview like any other', async () => {
      const html = htmlPage(
        `<meta property="og:title" content="Dan the Plumber on Instagram: &quot;Fixed it&quot;">
         <meta property="og:image" content="https://cdn.test/post.jpg">`,
      );
      const build = await buildLinkPreview(deps({ html }), 'https://www.instagram.com/p/abc/');
      expect(build.preview).toEqual({
        title: 'Dan the Plumber on Instagram: "Fixed it"',
        image: 'https://cdn.test/post.jpg',
      });
      expect(build.decision).toMatchObject({ outcome: 'preview', lockedHost: 'Instagram' });
    });

    it('treats a failed locked-host fetch as fetch_failed, not a discard', async () => {
      const build = await buildLinkPreview(
        deps({ fetchError: 'http_429' }),
        'https://www.instagram.com/p/abc/',
      );
      expect(build.decision).toMatchObject({ outcome: 'none', reason: 'fetch_failed' });
    });
  });

  describe('host lookups (D345)', () => {
    const video = 'https://www.youtube.com/watch?v=abc';

    it('looks up a lookup host whose page gave no title or image', async () => {
      const fetchJson = jsonAnswer({
        title: 'The clip',
        thumbnail_url: 'https://i.ytimg.test/t.jpg',
      });
      const log = { info: vi.fn(), warn: vi.fn() };
      const build = await buildLinkPreview(deps({ html: htmlPage(''), fetchJson }), video, log);
      expect(fetchJson).toHaveBeenCalledTimes(1);
      expect(build.preview).toEqual({ title: 'The clip', image: 'https://i.ytimg.test/t.jpg' });
      expect(build.candidates).toEqual(['https://i.ytimg.test/t.jpg']);
      expect(build.decision).toMatchObject({
        outcome: 'preview',
        imageSource: 'host_lookup',
        titleSource: 'host_lookup',
        lookup: 'ok',
      });
      expect(log.info).toHaveBeenCalledWith(
        expect.objectContaining({ event: PREVIEW_EVENTS.lookup, host: 'youtube.com' }),
        expect.any(String),
      );
    });

    it('looks up when the fetch failed', async () => {
      const fetchJson = jsonAnswer({ title: 'The clip' });
      const build = await buildLinkPreview(deps({ fetchError: 'http_403', fetchJson }), video);
      expect(build.preview).toEqual({ title: 'The clip' });
      expect(build.page).toBeNull();
    });

    it('keeps the page title and appends the thumbnail after the page images', async () => {
      const fetchJson = jsonAnswer({
        title: 'Lookup title',
        thumbnail_url: 'https://i.test/t.jpg',
      });
      const html = htmlPage('<title>Page title</title>');
      const build = await buildLinkPreview(deps({ html, fetchJson }), video);
      expect(build.preview?.title).toBe('Page title');
      expect(build.decision.titleSource).toBe('title_tag');
      expect(build.candidates).toEqual(['https://i.test/t.jpg']);
    });

    it('does not look up when the page has a title and an image', async () => {
      const fetchJson = jsonAnswer({ title: 'x' });
      const html = htmlPage(
        '<meta property="og:title" content="T"><meta property="og:image" content="https://i.test/a.jpg">',
      );
      const build = await buildLinkPreview(deps({ html, fetchJson }), video);
      expect(fetchJson).not.toHaveBeenCalled();
      expect(build.decision.lookup).toBe('skipped');
    });

    it('never looks up hosts off the list, or when lookups are off', async () => {
      const fetchJson = jsonAnswer({ title: 'x' });
      await buildLinkPreview(deps({ html: htmlPage(''), fetchJson }), 'https://site.test/a');
      expect(fetchJson).not.toHaveBeenCalled();
      const off = await buildLinkPreview(deps({ html: htmlPage(''), fetchJson: null }), video);
      expect(off.decision).toMatchObject({ outcome: 'none', lookup: 'skipped' });
    });

    it('records a failed lookup and still answers', async () => {
      const build = await buildLinkPreview(
        deps({ html: htmlPage('<title>Page</title>'), fetchJson: jsonAnswer(null, 'timeout') }),
        video,
      );
      expect(build.preview).toEqual({ title: 'Page' });
      expect(build.decision.lookup).toBe('failed');
    });

    it('caps the candidates', async () => {
      const metas = Array.from(
        { length: LINK_IMAGE_CANDIDATES_MAX },
        (_, i) => `<meta property="og:image" content="https://i.test/${i}.jpg">`,
      ).join('');
      const build = await buildLinkPreview(
        deps({
          html: htmlPage(metas),
          fetchJson: jsonAnswer({ thumbnail_url: 'https://i.test/t.jpg' }),
        }),
        video,
      );
      expect(build.candidates).toHaveLength(LINK_IMAGE_CANDIDATES_MAX);
      expect(build.candidates).not.toContain('https://i.test/t.jpg');
    });
  });
});

describe('logPreviewBuilt (D352)', () => {
  it('warns on a discard and informs otherwise, with closed-set values only', async () => {
    const log = { info: vi.fn(), warn: vi.fn() };
    const html = htmlPage('<meta property="og:title" content="Instagram">');
    const discarded = await buildLinkPreview(deps({ html }), 'https://instagram.com/p/x');
    logPreviewBuilt(log, 'ingest', discarded.decision, { jobId: 'j1', deckId: 'd1' });
    const [fields] = log.warn.mock.calls[0]!;
    expect(fields).toMatchObject({
      event: PREVIEW_EVENTS.built,
      caller: 'ingest',
      jobId: 'j1',
      outcome: 'discarded',
    });
    expect(previewOutcomes).toContain(fields.outcome);
    expect(previewReasons).toContain(fields.reason);
    expect(JSON.stringify(fields)).not.toContain('/p/x');

    const ok = await buildLinkPreview(
      deps({ html: htmlPage('<title>T</title>') }),
      'https://s.test/',
    );
    logPreviewBuilt(log, 'editor', ok.decision, { requestId: 'r1' });
    expect(log.info.mock.calls[0]![0]).toMatchObject({ caller: 'editor', outcome: 'preview' });
  });
});
