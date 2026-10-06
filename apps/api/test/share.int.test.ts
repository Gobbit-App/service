import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { categories, decks, ogImages } from '@pb/db';
import { MemoryOgStore } from '../src/share/og-store';
import { FAMILY_ID, fixtureId, setupApiTest } from './helpers';

const APP_URL = 'http://app.test';
const PUBLIC_ITEM = fixtureId('family/food/recipe-scaling');
const PUBLIC_TITLE = 'Recipe Scaling Calculator';
const PRIVATE_ITEM = fixtureId('family/school/homework-checklist');

function meta(html: string, property: string): string | undefined {
  return new RegExp(`<meta property="${property}" content="([^"]*)">`).exec(html)?.[1];
}

describe('GET /s/:itemId (P3.6, D58–D61)', () => {
  const store = new MemoryOgStore('test-cloud');
  const ogRenderer = vi.fn(async () => new Uint8Array([1, 2, 3]));
  const ctx = setupApiTest({ env: { APP_URL }, share: { ogStore: store, ogRenderer } });

  beforeAll(async () => {
    // Only a public deck with a public category makes a card publicly previewable (D59).
    await ctx.t.db.update(decks).set({ isPublic: true }).where(eq(decks.id, FAMILY_ID));
    await ctx.t.db
      .update(categories)
      .set({ visibility: 'public' })
      .where(and(eq(categories.deckId, FAMILY_ID), eq(categories.slug, 'food')));
  });

  async function share(itemId: string) {
    const res = await ctx.app.request(`/s/${itemId}`, { headers: ctx.anon() });
    return { res, html: await res.text() };
  }

  it('serves crawler HTML with cache and noindex headers', async () => {
    const { res, html } = await share(PRIVATE_ITEM);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toMatch(/text\/html/);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=300');
    expect(res.headers.get('X-Robots-Tag')).toBe('noindex');
    expect(html).toContain(`<meta http-equiv="refresh" content="0;url=/i/${PRIVATE_ITEM}">`);
  });

  it('gives a private card only the generic preview', async () => {
    const { html } = await share(PRIVATE_ITEM);
    expect(meta(html, 'og:title')).toBe('A card was shared with you');
    expect(meta(html, 'og:image')).toBe(`${APP_URL}/og/private.png`);
    expect(html).not.toContain('Daily Homework Checklist');
  });

  it('treats a missing item and a malformed id like a private one', async () => {
    for (const id of [randomUUID(), 'not-a-uuid']) {
      const { res, html } = await share(id);
      expect(res.status).toBe(200);
      expect(meta(html, 'og:title')).toBe('A card was shared with you');
    }
  });

  it('renders a public card once, records it and reuses the image', async () => {
    const first = await share(PUBLIC_ITEM);
    expect(meta(first.html, 'og:title')).toBe(PUBLIC_TITLE);
    const image = meta(first.html, 'og:image');
    expect(image).toMatch(/^https:\/\/res\.cloudinary\.com\/test-cloud\/.+og\//);
    expect(store.uploads.size).toBe(1);

    const rows = await ctx.t.db.select().from(ogImages).where(eq(ogImages.itemId, PUBLIC_ITEM));
    expect(rows).toHaveLength(1);

    const second = await share(PUBLIC_ITEM);
    expect(meta(second.html, 'og:image')).toBe(image);
    expect(ogRenderer).toHaveBeenCalledTimes(1);
    expect(store.uploads.size).toBe(1);
  });

  it('turns private once the card is archived', async () => {
    const archived = await ctx.app.request(`/items/${PUBLIC_ITEM}/archive`, {
      method: 'POST',
      headers: ctx.as(),
    });
    expect(archived.status).toBe(200);

    const { html } = await share(PUBLIC_ITEM);
    expect(meta(html, 'og:title')).toBe('A card was shared with you');
    expect(html).not.toContain(PUBLIC_TITLE);
  });
});
