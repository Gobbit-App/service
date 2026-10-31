import { beforeAll, describe, expect, it } from 'vitest';
import type { CategoryRow, DeckRow, ItemRow } from '@gobbit/db';
import { createCategory, createDeck, createItem } from '@gobbit/db/test';
import { setupApiTest } from './helpers';

const APP_URL = 'http://app.test';
const UNKNOWN_ITEM = '00000000-0000-4000-8000-0000000000ff';
const SITE_ID = '2f1c7a52-8f0e-4c3e-9b8a-0d6f2c4e1a90';
const TAG = `<script defer src="/stats/script.js" data-website-id="${SITE_ID}" data-host-url="/stats" data-domains="app.test" data-do-not-track="true"></script>`;

/** D232 (031), D249 (033): with analytics configured, the landing, public pages and share previews carry the tracker. */
describe('landing analytics tag (D232)', () => {
  const ctx = setupApiTest({
    env: { APP_URL, CORS_ORIGINS: APP_URL, ANALYTICS_SITE_ID: SITE_ID },
  });

  let deck: DeckRow;
  let category: CategoryRow;
  let item: ItemRow;

  beforeAll(async () => {
    const db = ctx.t.db;
    deck = await createDeck(db, ctx.world.owner, {
      slug: 'analytics-street',
      name: 'Analytics street',
      kind: 'communal',
      isPublic: true,
    });
    category = await createCategory(db, deck, {
      slug: 'notes',
      name: 'Notes',
      visibility: 'public',
      position: 1,
    });
    item = await createItem(db, deck, {
      card: { type: 'text', title: 'A public note', body: '', payload: {} },
      categoryIds: [category.id],
    });
  });

  it.each(['/welcome', '/welcome/joined', '/welcome?confirmed=1', '/welcome?confirm=invalid'])(
    '%s carries the tag in <head>',
    async (path) => {
      const html = await (await ctx.app.request(path)).text();
      expect(html).toContain(TAG);
      expect(html.indexOf(TAG)).toBeLessThan(html.indexOf('</head>'));
      expect(html.match(/<script/g)).toHaveLength(1);
    },
  );

  it('the 400 re-render carries the tag', async () => {
    const res = await ctx.app.request('/welcome', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: APP_URL },
      body: new URLSearchParams({ email: 'not-an-email', kind: 'family' }).toString(),
    });
    expect(res.status).toBe(400);
    expect(await res.text()).toContain(TAG);
  });

  it('thanks and confirm redirects carry only flag params', async () => {
    const res = await ctx.app.request('/welcome', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: APP_URL },
      body: new URLSearchParams({ email: 'tagged@example.test', kind: 'family' }).toString(),
    });
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('/welcome/joined');
  });

  /** D249 (033): public pages and share previews carry the pattern-only variant. */
  it.each([
    ['deck', () => `/p/${deck.slug}`, '/p/:deck', 'Public deck'],
    [
      'category',
      () => `/p/${deck.slug}/c/${category.slug}`,
      '/p/:deck/c/:category',
      'Public category',
    ],
    ['card', () => `/p/${deck.slug}/i/${item.id}`, '/p/:deck/i/:item', 'Public card'],
    // a public card's link redirects to its public page (D181): an unknown card gets the preview
    ['share preview', () => `/s/${UNKNOWN_ITEM}`, '/s/:item', 'Share preview'],
  ])('the %s page sends its route pattern only', async (_name, path, pattern, screen) => {
    const html = await (await ctx.app.request(path())).text();
    const head = html.slice(0, html.indexOf('</head>'));
    expect(head).toContain(
      `<script defer src="/analytics/page.js" data-pattern="${pattern}" data-screen="${screen}"></script>`,
    );
    expect(head).toContain('data-before-send="__gobbitAnalyticsBeforeSend"');
    expect(head).toContain('data-exclude-search="true"');
    const tags = head.match(/<script[^>]*>/g) ?? [];
    expect(tags).toHaveLength(2);
    expect(tags.join(' ')).not.toMatch(
      new RegExp(`${deck.slug}|${category.slug}|${item.id}|${UNKNOWN_ITEM}`),
    );
  });

  it('error pages and SEO files never carry it', async () => {
    for (const path of ['/p/no-such-deck', '/sitemap.xml', '/robots.txt']) {
      const body = await (await ctx.app.request(path)).text();
      expect(body, path).not.toContain('/stats/');
    }
  });
});
