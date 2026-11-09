import { beforeAll, describe, expect, it } from 'vitest';
import type { DeckRow, ItemRow, UserRow } from '@gobbit/db';
import { addMember, createAccountUser, createCategory, createDeck } from '@gobbit/db/test';
import type { SafeFetch } from '../src/fetch/safe-fetch';
import { json, setupApiTest } from './helpers';

const START = '2030-12-05T18:00:00+02:00';
const SECRET_ITEMS = ['notify', 'audience', 'imageLookup', '"event":', 'canEditNotify'];

/** Never touches the network: every page is a 200 with the same title. */
const site: SafeFetch = async (url) => ({
  status: 200,
  finalUrl: url,
  ms: 1,
  html: '<html><head><title>Summer fair</title></head><body></body></html>',
  error: null,
});

/** 042 US1 (T021/T022): what strangers see of an event, and its link plumbing. */
describe('event cards in public and link paths (042)', () => {
  const ctx = setupApiTest({
    search: { embedder: null },
    media: { linkCheckFetch: site, log: { info: () => {}, warn: () => {} } },
  });
  let deck: DeckRow;
  let member: UserRow;
  let event: ItemRow;
  let bare: ItemRow;

  beforeAll(async () => {
    deck = await createDeck(ctx.t.db, ctx.world.owner, {
      slug: 'fair-street',
      kind: 'communal',
      isPublic: true,
    });
    member = await createAccountUser(ctx.t.db);
    await addMember(ctx.t.db, deck, member, 'reader');
    const open = await createCategory(ctx.t.db, deck, { visibility: 'public' });

    const post = async (title: string, payload: Record<string, unknown>) => {
      const res = await ctx.app.request(`/decks/${deck.id}/items`, {
        method: 'POST',
        headers: ctx.as(),
        body: JSON.stringify({ type: 'event', title, payload, categoryIds: [open.id] }),
      });
      expect(res.status).toBe(201);
      return (await json(res)) as ItemRow;
    };
    event = await post('Street fair', {
      allDay: false,
      start: START,
      timeZone: 'Asia/Jerusalem',
      location: 'Marigold Hall',
      url: 'https://fair.example/2030',
      preview: { title: 'Summer fair', description: 'Stalls and music' },
      notify: {
        before: [{ amount: 1, unit: 'days' }],
        audience: { mode: 'people', userIds: [member.id] },
      },
    });
    bare = await post('Quiet meeting', {
      allDay: true,
      start: '2030-12-06',
      timeZone: 'UTC',
      notify: { before: [], audience: { mode: 'everyone', userIds: [] } },
    });
  });

  const expectNoSecrets = (text: string) => {
    for (const secret of SECRET_ITEMS) expect(text).not.toContain(secret);
    expect(text).not.toContain(member.id);
  };

  describe('public read (D365)', () => {
    it('the item API keeps content and drops notify and member state', async () => {
      const res = await ctx.app.request(`/public/fair-street/items/${event.id}`);
      expect(res.status).toBe(200);
      const text = await res.text();
      expectNoSecrets(text);
      const body = JSON.parse(text);
      expect(body.payload).toMatchObject({
        start: START,
        timeZone: 'Asia/Jerusalem',
        location: 'Marigold Hall',
        url: 'https://fair.example/2030',
      });
    });

    it('the list API too', async () => {
      const res = await ctx.app.request('/public/fair-street/items');
      expect(res.status).toBe(200);
      expectNoSecrets(await res.text());
    });

    it('the card page shows the when in its zone, the place and the link (D367)', async () => {
      const res = await ctx.app.request(`/p/fair-street/i/${event.id}`);
      expect(res.status).toBe(200);
      const page = await res.text();
      expect(page).toContain('18:00');
      expect(page).toContain('(Asia/Jerusalem)');
      expect(page).toContain('Marigold Hall');
      expect(page).toContain('https://fair.example/2030');
      expect(page).toMatch(/<meta[^>]+description[^>]+· Marigold Hall/);
      expectNoSecrets(page);
    });

    it('public search finds an event by its location', async () => {
      const res = await ctx.app.request('/public/fair-street/search?q=marigold');
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(JSON.parse(text).data.map((h: { item: { id: string } }) => h.item.id)).toContain(
        event.id,
      );
      expectNoSecrets(text);
    });
  });

  it('member search finds an event by its link title (D372)', async () => {
    const res = await ctx.app.request(`/decks/${deck.slug}/search?q=summer%20fair`, {
      headers: ctx.as(),
    });
    expect(res.status).toBe(200);
    expect((await json(res)).data.map((h: { item: { id: string } }) => h.item.id)).toContain(
      event.id,
    );
  });

  describe('link plumbing (T022)', () => {
    it('a manual link check accepts an event with a url, 422 without', async () => {
      const ok = await ctx.app.request(`/items/${event.id}/link-check`, {
        method: 'POST',
        headers: ctx.as(),
      });
      expect(ok.status).toBe(200);
      expect((await json(ok)).id).toBe(event.id);

      const none = await ctx.app.request(`/items/${bare.id}/link-check`, {
        method: 'POST',
        headers: ctx.as(),
      });
      expect(none.status).toBe(422);
    });

    it('?flag=link lists a flagged event', async () => {
      await ctx.t.pool.query(
        `UPDATE link_checks SET status = 'changed', flagged_at = now(), dismissed_at = null
         WHERE item_id = $1`,
        [event.id],
      );
      const res = await ctx.app.request(`/decks/${deck.id}/items?flag=link`, {
        headers: ctx.as(),
      });
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.data.map((i: { id: string }) => i.id)).toEqual([event.id]);
      expect(body.data[0].linkHealth).toMatchObject({ status: 'changed' });
    });
  });
});
