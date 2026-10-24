import { describe, expect, it } from 'vitest';
import { robotsFor, robotsTxt, sitemapXml } from './seo';

describe('seo (D179)', () => {
  it('robots.txt disallows the app and points at the sitemap', () => {
    const txt = robotsTxt('https://gobbit.example');
    const lines = txt.trim().split('\n');
    expect(lines[0]).toBe('User-agent: *');
    for (const path of [
      '/api/',
      '/s/',
      '/d/',
      '/i/',
      '/settings',
      '/share',
      '/sign-in',
      '/p/*/search',
    ]) {
      expect(lines).toContain(`Disallow: ${path}`);
    }
    expect(lines.at(-1)).toBe('Sitemap: https://gobbit.example/sitemap.xml');
    expect(txt).not.toContain('Disallow: /p/\n');
  });

  it('robotsFor indexes communal decks only', () => {
    expect(robotsFor({ kind: 'communal' })).toBe('index');
    expect(robotsFor({ kind: 'shared' })).toBe('noindex');
  });

  it('sitemap escapes locations and formats lastmod as a date', () => {
    const xml = sitemapXml([
      { loc: 'https://gobbit.example/p/a&b', lastmod: new Date('2026-10-05T23:30:00.000Z') },
      { loc: 'https://gobbit.example/p/c', lastmod: null },
    ]);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain(
      '<url><loc>https://gobbit.example/p/a&amp;b</loc><lastmod>2026-10-05</lastmod></url>',
    );
    expect(xml).toContain('<url><loc>https://gobbit.example/p/c</loc></url>');
  });

  it('an empty sitemap is still a valid urlset', () => {
    expect(sitemapXml([])).toContain(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</urlset>',
    );
  });
});
