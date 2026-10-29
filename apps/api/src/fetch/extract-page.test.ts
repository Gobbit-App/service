import { describe, expect, it } from 'vitest';
import { PAGE_TEXT_MAX } from '@gobbit/shared';
import { collapseWhitespace, extractPage } from './extract-page';

const PARAGRAPHS = [
  'The river wound slowly through the valley, carrying silt from the distant mountains toward the sea. Farmers along its banks have relied on it for generations.',
  'Every spring the water rose higher than usual, and the village gathered to watch the flood. Children built small dams of stone while their parents repaired the old bridge.',
  'In recent years the council proposed a new embankment, but residents argued that the wetlands should remain untouched so that birds and fish could return each season.',
];

const ARTICLE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <title>Real Title</title>
  <meta property="og:title" content="OG Article Title">
  <meta property="og:description" content="An article about the river">
  <meta property="og:site_name" content="Example Site">
  <meta property="og:image" content="/img/a.jpg">
</head>
<body>
  <nav>Home | About | Contact</nav>
  <article>
    ${PARAGRAPHS.map((p) => `<p>${p}</p>`).join('\n    ')}
  </article>
</body>
</html>`;

describe('extractPage (D-page)', () => {
  it('extracts og, title, lang and readable text from an article page', () => {
    const page = extractPage(ARTICLE_HTML, 'https://example.com/post');

    expect(page.og.image).toBe('https://example.com/img/a.jpg');
    expect(page.og.title).toBe('OG Article Title');
    expect(page.og.description).toBe('An article about the river');
    expect(page.og.siteName).toBe('Example Site');
    expect(page.title).toBe('OG Article Title');
    expect(page.lang).toBe('en');
    expect(page.text).toContain('The river wound slowly through the valley');
  });

  it('returns empty or very short text for an OG-only page with an empty body', () => {
    const html =
      '<html><head>' +
      '<meta property="og:title" content="OG Title">' +
      '<meta property="og:description" content="OG description here">' +
      '</head><body></body></html>';
    const page = extractPage(html, 'https://example.com/og-only');

    expect(page.og.title).toBe('OG Title');
    expect(page.og.description).toBe('OG description here');
    expect(page.text.length).toBeLessThan(50);
  });

  it('falls back to the <title> text when there is no og data', () => {
    const html = '<html><head><title>Only Title</title></head><body><p>x</p></body></html>';
    const page = extractPage(html, 'https://example.com/plain');

    expect(page.title).toBe('Only Title');
    expect(page.og.title).toBeNull();
    expect(page.og.description).toBeNull();
    expect(page.og.image).toBeNull();
    expect(page.og.siteName).toBeNull();
  });

  it('drops non-http(s) og:image values', () => {
    const html =
      '<html><head><meta property="og:image" content="javascript:alert(1)"></head>' +
      '<body></body></html>';
    const page = extractPage(html, 'https://example.com/xss');

    expect(page.og.image).toBeNull();
  });

  it('does not throw on empty html and returns a null title', () => {
    expect(() => extractPage('', 'https://example.com/empty')).not.toThrow();
    const page = extractPage('', 'https://example.com/empty');

    expect(page.title).toBeNull();
  });

  it('cuts extracted text to PAGE_TEXT_MAX characters', () => {
    const paragraphs = Array.from(
      { length: 200 },
      (_, i) => `<p>Paragraph ${i} ${'lorem ipsum dolor sit amet '.repeat(5)}.</p>`,
    ).join('\n');
    const html = `<html><head><title>Long</title></head><body><article>${paragraphs}</article></body></html>`;
    const page = extractPage(html, 'https://example.com/long');

    expect(page.text.length).toBeLessThanOrEqual(PAGE_TEXT_MAX);
  });
});

describe('collapseWhitespace (D-page)', () => {
  it('collapses runs of spaces and tabs, and limits blank lines to one', () => {
    expect(collapseWhitespace('  a \t b \n\n\n\n c  ')).toBe('a b\n\nc');
  });
});
