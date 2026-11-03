import { describe, expect, it } from 'vitest';
import { renderBodyHtml } from './render';

describe('renderBodyHtml', () => {
  it('renders single newlines as breaks (D283)', () => {
    expect(renderBodyHtml('Milk\nEggs\nBread')).toBe('<p>Milk<br>\nEggs<br>\nBread</p>');
  });

  it('keeps blank lines as paragraphs', () => {
    expect(renderBodyHtml('One\n\nTwo')).toBe('<p>One</p>\n<p>Two</p>');
  });

  it.each([
    [':u[a]', '<p><u>a</u></p>'],
    [':small[a]', '<p><span class="rt-small">a</span></p>'],
    [':large[a]', '<p><span class="rt-large">a</span></p>'],
    [':color[a]{.red}', '<p><span class="rt-color rt-color--red">a</span></p>'],
    [
      ':large[:color[**x**]{.blue}]',
      '<p><span class="rt-large"><span class="rt-color rt-color--blue"><strong>x</strong></span></span></p>',
    ],
  ])('renders %s', (body, html) => {
    expect(renderBodyHtml(body)).toBe(html);
  });

  it.each([
    [':color[hot]{.pink}', '<p>hot</p>'],
    [':huge[hot]', '<p>hot</p>'],
    ['Re:Plan at 10:30', '<p>Re:Plan at 10:30</p>'],
    ['## :small[quiet] title', '<h2>quiet title</h2>'],
    ['::leaf[x]', '<p>x</p>'],
  ])('treats %s as plain content', (body, html) => {
    expect(renderBodyHtml(body)).toBe(html);
  });

  it('never lets a directive inject classes or attributes', () => {
    const out = renderBodyHtml(':color[x]{.red onclick="a()" style="color:red" #id}');
    expect(out).not.toContain('onclick');
    expect(out).not.toContain('style');
    expect(out).not.toContain('id=');
  });

  it('keeps pre-038 bodies rendering the same (SC-004)', () => {
    expect(renderBodyHtml('**bold** and *italic* and `code`')).toBe(
      '<p><strong>bold</strong> and <em>italic</em> and <code>code</code></p>',
    );
    expect(renderBodyHtml('## Steps\n\n1. First\n2. Second')).toBe(
      '<h2>Steps</h2>\n<ol>\n<li>First</li>\n<li>Second</li>\n</ol>',
    );
  });
});
