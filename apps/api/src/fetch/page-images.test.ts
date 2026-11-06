import { parseHTML } from 'linkedom';
import { describe, expect, it } from 'vitest';
import { LINK_IMAGE_CANDIDATES_MAX, LINK_PREVIEW_IMAGE_URL_MAX } from '@gobbit/shared';
import { collectImageCandidates, resolveImageUrl } from './page-images';

const BASE = 'https://site.example/posts/1';
const MIN = 600;

function collect(head: string, articleHtml: string | null = null) {
  const { document } = parseHTML(`<!doctype html><html><head>${head}</head><body></body></html>`);
  return collectImageCandidates(document as unknown as Document, BASE, {
    articleHtml,
    articleMinPx: MIN,
  });
}

const urls = (head: string, article: string | null = null) =>
  collect(head, article).map((c) => c.url);
const ld = (data: unknown) =>
  `<script type="application/ld+json">${typeof data === 'string' ? data : JSON.stringify(data)}</script>`;

describe('resolveImageUrl', () => {
  it('resolves relative URLs against the page', () => {
    expect(resolveImageUrl('/a.jpg', BASE)).toBe('https://site.example/a.jpg');
    expect(resolveImageUrl('b.jpg', BASE)).toBe('https://site.example/posts/b.jpg');
  });

  it.each([null, '', '  ', 'data:image/png;base64,AAA', 'javascript:alert(1)', 'ftp://x/a.jpg'])(
    'rejects %j',
    (value) => {
      expect(resolveImageUrl(value, BASE)).toBeNull();
    },
  );

  it('rejects URLs over the preview URL cap', () => {
    const long = `https://site.example/${'a'.repeat(LINK_PREVIEW_IMAGE_URL_MAX)}.jpg`;
    expect(resolveImageUrl(long, BASE)).toBeNull();
  });
});

describe('collectImageCandidates (D344, FR-010)', () => {
  it('orders sources og, og secure, twitter, structured data, image_src, poster, article', () => {
    const head = [
      '<link rel="image_src" href="/src.jpg">',
      '<meta name="twitter:image" content="/tw.jpg">',
      ld({ image: '/ld.jpg' }),
      '<meta property="og:image:secure_url" content="/secure.jpg">',
      '<meta property="og:image" content="/og.jpg">',
    ].join('');
    const { document } = parseHTML(
      `<html><head>${head}</head><body><video poster="/poster.jpg"></video></body></html>`,
    );
    const out = collectImageCandidates(document as unknown as Document, BASE, {
      articleHtml: '<img src="/article.jpg" width="800">',
      articleMinPx: MIN,
    });
    // Five is the cap: the article image would be sixth.
    expect(out.map((c) => c.source)).toEqual([
      'og',
      'og_secure',
      'twitter',
      'structured_data',
      'image_src',
    ]);
    expect(out).toHaveLength(LINK_IMAGE_CANDIDATES_MAX);
  });

  it('reads the meta name/property variants', () => {
    expect(urls('<meta name="og:image" content="/a.jpg">')).toEqual(['https://site.example/a.jpg']);
    expect(urls('<meta property="og:image:url" content="/b.jpg">')).toEqual([
      'https://site.example/b.jpg',
    ]);
    expect(urls('<meta name="twitter:image:src" content="/c.jpg">')).toEqual([
      'https://site.example/c.jpg',
    ]);
  });

  it('reads JSON-LD as a string, an object, an array and inside @graph', () => {
    expect(urls(ld({ image: 'https://cdn.example/1.jpg' }))).toEqual(['https://cdn.example/1.jpg']);
    expect(urls(ld({ image: { url: 'https://cdn.example/2.jpg' } }))).toEqual([
      'https://cdn.example/2.jpg',
    ]);
    expect(
      urls(ld({ image: ['https://cdn.example/3.jpg', { url: 'https://cdn.example/4.jpg' }] })),
    ).toEqual(['https://cdn.example/3.jpg', 'https://cdn.example/4.jpg']);
    expect(
      urls(ld({ '@graph': [{ name: 'x' }, { thumbnailUrl: 'https://cdn.example/5.jpg' }] })),
    ).toEqual(['https://cdn.example/5.jpg']);
    expect(urls(ld([{ image: 'https://cdn.example/6.jpg' }]))).toEqual([
      'https://cdn.example/6.jpg',
    ]);
  });

  it('skips bad or oversized JSON-LD and non-URL image values', () => {
    expect(urls(ld('{not json'))).toEqual([]);
    expect(urls(ld({ image: 42 }))).toEqual([]);
    expect(urls(ld({ image: 'x'.repeat(100_001) }))).toEqual([]);
  });

  it('drops data URIs and keeps the next candidate', () => {
    const out = collect(
      '<meta property="og:image" content="data:image/png;base64,AAA"><meta name="twitter:image" content="/hero.jpg">',
    );
    expect(out).toEqual([{ url: 'https://site.example/hero.jpg', source: 'twitter' }]);
  });

  it('deduplicates, the first source winning', () => {
    const out = collect(
      '<meta property="og:image" content="https://site.example/a.jpg"><meta name="twitter:image" content="/a.jpg">',
    );
    expect(out).toEqual([{ url: 'https://site.example/a.jpg', source: 'og' }]);
  });

  it(`caps the list at ${LINK_IMAGE_CANDIDATES_MAX}`, () => {
    const head = Array.from(
      { length: 8 },
      (_, i) => `<meta property="og:image" content="/${i}.jpg">`,
    );
    expect(collect(head.join(''))).toHaveLength(LINK_IMAGE_CANDIDATES_MAX);
  });

  it('reads image_src and video posters', () => {
    expect(collect('<link rel="image_src" href="/s.jpg">')).toEqual([
      { url: 'https://site.example/s.jpg', source: 'image_src' },
    ]);
    const { document } = parseHTML('<html><body><video poster="/p.jpg"></video></body></html>');
    expect(
      collectImageCandidates(document as unknown as Document, BASE, { articleMinPx: MIN }),
    ).toEqual([{ url: 'https://site.example/p.jpg', source: 'video_poster' }]);
  });

  describe('article image rule', () => {
    const article = (html: string) => collect('', html);

    it('picks the widest image with a stated width of at least the minimum', () => {
      expect(
        article(
          '<img src="/small.jpg" width="300"><img src="/big.jpg" width="1200"><img src="/mid.jpg" width="800">',
        ),
      ).toEqual([{ url: 'https://site.example/big.jpg', source: 'article' }]);
    });

    it('ignores images without a stated size or below the minimum', () => {
      expect(article('<img src="/a.jpg"><img src="/b.jpg" width="599">')).toEqual([]);
      expect(article('<img src="/c.jpg" width="80%">')).toEqual([]);
    });

    it('requires a stated height to be at least half the minimum', () => {
      expect(article('<img src="/strip.jpg" width="1200" height="100">')).toEqual([]);
      expect(article('<img src="/ok.jpg" width="1200" height="300">')).toHaveLength(1);
    });

    it('uses the widest srcset entry, scaling the stated height', () => {
      expect(
        article('<img src="/s.jpg" srcset="/s.jpg 400w, /l.jpg 1600w" width="400" height="300">'),
      ).toEqual([{ url: 'https://site.example/l.jpg', source: 'article' }]);
      // 400x100 stated, 1600w → 400 high at 1600: kept.
      expect(article('<img srcset="/x.jpg 1600w" width="400" height="100">')).toHaveLength(1);
    });

    it.each([
      ['class', '<img class="site-logo" src="/a.jpg" width="900">'],
      ['id', '<img id="author-avatar" src="/a.jpg" width="900">'],
      ['alt', '<img alt="Share icon" src="/a.jpg" width="900">'],
      ['file name', '<img src="/img/tracking-pixel.gif" width="900">'],
    ])('skips decoration named by its %s', (_kind, html) => {
      expect(article(html)).toEqual([]);
    });

    it('never throws on odd article HTML', () => {
      expect(article('<img src="http://[bad" width="900"><<<')).toEqual([]);
    });
  });
});
