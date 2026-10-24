import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './markdown';

const render = (md: string) => renderMarkdown(md).toString();

describe('renderMarkdown (D177)', () => {
  it('keeps lists, emphasis and links', () => {
    const out = render('- **one**\n- [two](https://example.com/a)');
    expect(out).toContain('<ul>');
    expect(out).toContain('<strong>one</strong>');
    expect(out).toContain('<a href="https://example.com/a">two</a>');
  });

  it('escapes raw HTML', () => {
    const out = render('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;script&gt;');
  });

  it('drops javascript: and data: link targets', () => {
    const out = render('[a](javascript:alert(1)) [b](data:text/html,x) [c](JavaScript:alert(1))');
    expect(out.toLowerCase()).not.toContain('javascript:');
    expect(out).not.toContain('data:');
    expect(out).toContain('href=""');
  });
});
