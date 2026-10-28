import { beforeAll, describe, expect, it } from 'vitest';
import type { CategoryRow, DeckRow, ItemRow } from '@pb/db';
import { createCategory, createDeck, createItem } from '@pb/db/test';
import { setupApiTest } from './helpers';

const APP_URL = 'http://app.test';
const SITE_ID = '2f1c7a52-8f0e-4c3e-9b8a-0d6f2c4e1a90';
const TAG = `<script defer src="/stats/script.js" data-website-id="${SITE_ID}" data-host-url="/stats" data-domains="app.test" data-do-not-track="true"></script>`;

/** D232 (031): with analytics configured, the tracker is on the landing page and nowhere else. */
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

  it('public pages, errors and SEO files never carry it', async () => {
    const paths = [
      `/p/${deck.slug}`,
      `/p/${deck.slug}/c/${category.slug}`,
      `/p/${deck.slug}/i/${item.id}`,
      '/p/no-such-deck',
      '/sitemap.xml',
      '/robots.txt',
    ];
    for (const path of paths) {
      const body = await (await ctx.app.request(path)).text();
      expect(body, path).not.toContain('/stats/');
    }
  });
});
