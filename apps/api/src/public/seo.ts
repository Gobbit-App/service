import type { DeckKind } from '@pb/shared';
import { h } from './html';
import { landingUrl } from './public-url';

/** D179: app routes crawlers have no business in. */
export const ROBOTS_DISALLOW = [
  '/api/',
  '/s/',
  '/d/',
  '/i/',
  '/settings',
  '/share',
  '/sign-in',
  '/p/*/search',
];

/** D179: `/robots.txt`, pointing at the API-served sitemap. */
export function robotsTxt(origin: string): string {
  return [
    'User-agent: *',
    ...ROBOTS_DISALLOW.map((path) => `Disallow: ${path}`),
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n');
}

/** D179: communal decks are indexable; shared public decks are not. */
export function robotsFor(deck: { kind: DeckKind }): 'index' | 'noindex' {
  return deck.kind === 'communal' ? 'index' : 'noindex';
}

export type SitemapEntry = { loc: string; lastmod: Date | null };

/**
 * D179: `<urlset>` with `lastmod` as a UTC date (YYYY-MM-DD). Every value escaped. The root
 * (030's landing page, D229) is always the first `<url>`, without `lastmod`.
 */
export function sitemapXml(origin: string, entries: SitemapEntry[]): string {
  const all: SitemapEntry[] = [{ loc: landingUrl(origin), lastmod: null }, ...entries];
  return h`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${all.map(
  (e) =>
    h`<url><loc>${e.loc}</loc>${e.lastmod ? h`<lastmod>${e.lastmod.toISOString().slice(0, 10)}</lastmod>` : ''}</url>
`,
)}</urlset>
`.toString();
}
