import { describe, it, expect } from 'vitest';
import {
  escapeHtml,
  renderSharePage,
  PRIVATE_SHARE_TITLE,
  PRIVATE_SHARE_DESCRIPTION,
} from './share-page';

describe('escapeHtml', () => {
  it('escapes ampersand', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('escapes less-than', () => {
    expect(escapeHtml('a < b')).toBe('a &lt; b');
  });

  it('escapes greater-than', () => {
    expect(escapeHtml('a > b')).toBe('a &gt; b');
  });

  it('escapes double quotes', () => {
    expect(escapeHtml('a "b" c')).toBe('a &quot;b&quot; c');
  });

  it('escapes single quotes', () => {
    expect(escapeHtml("a 'b' c")).toBe('a &#39;b&#39; c');
  });

  it('escapes ampersand first', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });

  it('escapes all entities in sequence', () => {
    expect(escapeHtml('<script>alert("XSS")</script>')).toBe(
      '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;',
    );
  });
});

describe('renderSharePage', () => {
  const baseMeta = {
    title: 'Test Title',
    description: 'Test Description',
    imageUrl: 'https://example.com/image.png',
    imageWidth: 1200,
    imageHeight: 630,
    canonicalUrl: 'https://gobbit.niranhome.win/items/123',
    redirectPath: '/items/123',
    locale: 'en_US',
    lang: 'en',
  };

  it('renders doctype and html tag', () => {
    const html = renderSharePage(baseMeta);
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('</html>');
  });

  it('renders head with charset', () => {
    const html = renderSharePage(baseMeta);
    expect(html).toContain('<meta charset="utf-8">');
  });

  it('renders title tag', () => {
    const html = renderSharePage(baseMeta);
    expect(html).toContain('<title>Test Title</title>');
  });

  it('escapes title with script tags', () => {
    const html = renderSharePage({
      ...baseMeta,
      title: '<script>alert(1)</script>',
    });
    expect(html).toContain('<title>&lt;script&gt;alert(1)&lt;/script&gt;</title>');
    expect(html).not.toContain('<script>');
  });

  it('renders robots noindex meta', () => {
    const html = renderSharePage(baseMeta);
    expect(html).toContain('<meta name="robots" content="noindex">');
  });

  it('renders description meta with escaped value', () => {
    const html = renderSharePage({
      ...baseMeta,
      description: 'Test "quoted" & <tagged>',
    });
    expect(html).toContain(
      '<meta name="description" content="Test &quot;quoted&quot; &amp; &lt;tagged&gt;">',
    );
  });

  it('renders og:type meta', () => {
    const html = renderSharePage(baseMeta);
    expect(html).toContain('<meta property="og:type" content="website">');
  });

  it('renders og:site_name meta', () => {
    const html = renderSharePage(baseMeta);
    expect(html).toContain('<meta property="og:site_name" content="Gobbit">');
  });

  it('renders og:title with escaped value', () => {
    const html = renderSharePage(baseMeta);
    expect(html).toContain('<meta property="og:title" content="Test Title">');
  });

  it('renders og:description with escaped value', () => {
    const html = renderSharePage(baseMeta);
    expect(html).toContain('<meta property="og:description" content="Test Description">');
  });

  it('renders og:url with canonical URL', () => {
    const html = renderSharePage(baseMeta);
    expect(html).toContain(
      '<meta property="og:url" content="https://gobbit.niranhome.win/items/123">',
    );
  });

  it('renders og:image with escaped URL', () => {
    const html = renderSharePage(baseMeta);
    expect(html).toContain('<meta property="og:image" content="https://example.com/image.png">');
  });

  it('renders og:image:width', () => {
    const html = renderSharePage(baseMeta);
    expect(html).toContain('<meta property="og:image:width" content="1200">');
  });

  it('renders og:image:height', () => {
    const html = renderSharePage(baseMeta);
    expect(html).toContain('<meta property="og:image:height" content="630">');
  });

  it('renders og:locale with escaped value', () => {
    const html = renderSharePage(baseMeta);
    expect(html).toContain('<meta property="og:locale" content="en_US">');
  });

  it('renders twitter:card meta', () => {
    const html = renderSharePage(baseMeta);
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
  });

  it('renders twitter:title with escaped value', () => {
    const html = renderSharePage(baseMeta);
    expect(html).toContain('<meta name="twitter:title" content="Test Title">');
  });

  it('renders twitter:description with escaped value', () => {
    const html = renderSharePage(baseMeta);
    expect(html).toContain('<meta name="twitter:description" content="Test Description">');
  });

  it('renders twitter:image with escaped URL', () => {
    const html = renderSharePage(baseMeta);
    expect(html).toContain('<meta name="twitter:image" content="https://example.com/image.png">');
  });

  it('renders canonical link with escaped URL', () => {
    const html = renderSharePage(baseMeta);
    expect(html).toContain('<link rel="canonical" href="https://gobbit.niranhome.win/items/123">');
  });

  it('renders refresh meta with escaped redirect path', () => {
    const html = renderSharePage(baseMeta);
    expect(html).toContain('<meta http-equiv="refresh" content="0;url=/items/123">');
  });

  it('renders body with redirect link and escaped path', () => {
    const html = renderSharePage(baseMeta);
    expect(html).toContain('<p><a href="/items/123">Open in Gobbit</a></p>');
  });

  it('escapes special characters in all attributes', () => {
    const html = renderSharePage({
      ...baseMeta,
      title: 'Test "quote"',
      description: 'Test <tag>',
      canonicalUrl: 'https://example.com/path?param="value"',
      redirectPath: '/path?param="value"',
      imageUrl: 'https://example.com/image&large.png',
    });
    expect(html).toContain('<title>Test &quot;quote&quot;</title>');
    expect(html).toContain('<meta name="description" content="Test &lt;tag&gt;">');
    expect(html).toContain(
      '<meta property="og:url" content="https://example.com/path?param=&quot;value&quot;">',
    );
    expect(html).toContain(
      '<meta http-equiv="refresh" content="0;url=/path?param=&quot;value&quot;">',
    );
    expect(html).toContain(
      '<meta property="og:image" content="https://example.com/image&amp;large.png">',
    );
  });

  it('produces identical output for identical input', () => {
    const html1 = renderSharePage(baseMeta);
    const html2 = renderSharePage(baseMeta);
    expect(html1).toBe(html2);
  });

  it('exports PRIVATE_SHARE_TITLE constant', () => {
    expect(PRIVATE_SHARE_TITLE).toBe('A card was shared with you');
  });

  it('exports PRIVATE_SHARE_DESCRIPTION constant', () => {
    expect(PRIVATE_SHARE_DESCRIPTION).toBe('Open it in Gobbit');
  });
});
