import { RICH_TEXT_FIXTURES } from '@gobbit/shared/rich-text/fixtures';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
// The public-page renderer, imported directly so both sides run on the same fixtures (SC-002).
import { renderBodyHtml } from '../../../api/src/rich-text/render';
import { TextCard } from './TextCard';

/** Drop the reader-only attributes (dir, new-tab links) and serialisation differences. */
function normalize(html: string): string {
  return html
    .replace(/^<div class="text-card rt-flow">|<\/div>$/g, '')
    .replaceAll(' dir="auto"', '')
    .replaceAll(' target="_blank" rel="noopener noreferrer"', '')
    .replaceAll('<br/>', '<br>')
    .replace(/>\n+</g, '><')
    .replace(/<br>\n/g, '<br>');
}

describe('reader and public pages render bodies alike (FR-004)', () => {
  it.each(RICH_TEXT_FIXTURES)('$name', ({ body }) => {
    const reader = normalize(renderToStaticMarkup(<TextCard body={body} />));
    const publicPage = normalize(renderBodyHtml(body));
    expect(reader).toBe(publicPage);
  });
});
