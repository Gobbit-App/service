import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LINK_ARTICLE_IMAGE_MIN_PX } from '@gobbit/shared';
import { extractPage } from './extract-page';

interface CorpusPage {
  file: string;
  url: string;
  /** The image the preview should get; null when the page carries none. */
  expected: string | null;
  source: string | null;
  /** The pre-041 OG-only rule already found `expected`. */
  ogOnly: boolean;
}

const dir = new URL('./__fixtures__/preview-pages/', import.meta.url);
const { pages } = JSON.parse(readFileSync(new URL('manifest.json', dir), 'utf8')) as {
  pages: CorpusPage[];
};

const results = pages.map((page) => {
  const html = readFileSync(new URL(page.file, dir), 'utf8');
  const extracted = extractPage(html, page.url, { articleMinPx: LINK_ARTICLE_IMAGE_MIN_PX });
  return {
    page,
    og: extracted.og.image,
    first: extracted.images[0] ?? null,
    all: extracted.images,
  };
});

describe('page image corpus (D353)', () => {
  it('has the 16 committed pages', () => {
    expect(pages).toHaveLength(16);
  });

  it('SC-002: at least 90% of pages that carry an image get it', () => {
    const withImage = results.filter((r) => r.page.expected);
    const found = withImage.filter((r) => r.first?.url === r.page.expected);
    const missed = withImage
      .filter((r) => r.first?.url !== r.page.expected)
      .map((r) => r.page.file);
    expect(found.length / withImage.length, `missed: ${missed.join(', ')}`).toBeGreaterThanOrEqual(
      0.9,
    );
    // Up from the share the OG-only rule found.
    const before = withImage.filter((r) => r.page.ogOnly).length;
    expect(found.length).toBeGreaterThan(before);
  });

  it('SC-003: no page that had an OG-only preview loses it', () => {
    for (const r of results.filter((x) => x.page.ogOnly)) {
      expect(r.og, r.page.file).toBe(r.page.expected);
      expect(r.first?.url, r.page.file).toBe(r.page.expected);
      expect(r.first?.source, r.page.file).toBe('og');
    }
  });

  it('the manifest marks ogOnly exactly where the OG-only rule finds the image', () => {
    for (const r of results.filter((x) => x.page.expected)) {
      expect(r.og === r.page.expected, r.page.file).toBe(r.page.ogOnly);
    }
  });

  it('records the source each image came from', () => {
    for (const r of results.filter((x) => x.page.expected)) {
      expect(r.first?.source, r.page.file).toBe(r.page.source);
    }
  });

  it('pages without an image get none', () => {
    for (const r of results.filter((x) => !x.page.expected)) {
      expect(r.all, r.page.file).toEqual([]);
    }
  });
});
