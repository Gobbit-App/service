import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { items, linkChecks, type DeckRow, type ItemRow, type UserRow } from '@gobbit/db';
import { LINK_CHECK_BATCH, LINK_CHECK_RATE_PER_HOUR, type LinkCheckStatus } from '@gobbit/shared';
import { addMember, createAccountUser, createDeck, createItem } from '@gobbit/db/test';
import { extractPage } from '../src/fetch/extract-page';
import type { SafeFetch } from '../src/fetch/safe-fetch';
import { createLinkChecksRepo } from '../src/repositories/link-checks.repo';
import { createLinkChecksService, createLinkProbe } from '../src/services/link-checks.service';
import { json, setupApiTest, type ApiTestContext } from './helpers';

const DAY_MS = 86_400_000;

/**
 * Stand-in for the guarded link-check fetch (D164): answers by path, records every URL, never
 * touches the network. `status` can be changed per path between checks.
 */
function fakeSite() {
  const requested: string[] = [];
  const status = new Map<string, number>();
  const titles = new Map<string, string>();
  const fetch: SafeFetch = async (url) => {
    requested.push(url);
    const path = new URL(url).pathname;
    const code = status.get(path) ?? 200;
    if (code !== 200) {
      return { status: code, finalUrl: url, ms: 1, html: null, error: `http_${code}` };
    }
    const title = titles.get(path) ?? 'Same page';
    return {
      status: 200,
      finalUrl: url,
      ms: 1,
      html: `<html><head><title>${title}</title></head><body></body></html>`,
      error: null,
    };
  };
  return { fetch, requested, status, titles };
}

/** Sample-world link cards would be due too: archive them so each describe owns its links. */
async function hideSampleLinks(ctx: ApiTestContext): Promise<void> {
  await ctx.t.db.update(items).set({ status: 'archived' }).where(eq(items.type, 'link'));
}

const linkCard = (url: string, title = 'Same page') => ({
  card: { type: 'link' as const, title, payload: { url, preview: { title } } },
});

/** A sweep service over the real repo with a controllable clock (no jitter). */
function sweepHarness(ctx: ApiTestContext, site: ReturnType<typeof fakeSite>) {
  const state = { now: new Date('2026-10-01T06:30:00.000Z') };
  const sweeper = () =>
    createLinkChecksService({
      linkChecks: createLinkChecksRepo(ctx.t.db),
      probe: createLinkProbe({ safeFetch: site.fetch, extract: extractPage }),
      now: () => state.now,
      random: () => 0.5,
      log: () => {},
    });
  const advance = (ms: number) => {
    state.now = new Date(state.now.getTime() + ms);
  };
  return { state, sweeper, advance };
}

describe('link check sweep batches (D164)', () => {
  const site = fakeSite();
  const ctx = setupApiTest({ media: { linkCheckFetch: site.fetch, log: () => {} } });
  const { state, sweeper } = sweepHarness(ctx, site);
  let deck: DeckRow;

  beforeAll(async () => {
    await hideSampleLinks(ctx);
    deck = await createDeck(ctx.t.db, ctx.world.owner);
  });

  it('checks at most a batch of due links per run and skips proposed, archived and deleted', async () => {
    const total = LINK_CHECK_BATCH + 20;
    for (let i = 0; i < total; i++) {
      await createItem(ctx.t.db, deck, linkCard(`https://bulk.example/ok/${i}`));
    }
    await createItem(ctx.t.db, deck, {
      ...linkCard('https://skip.example/proposed'),
      status: 'proposed',
    });
    await createItem(ctx.t.db, deck, {
      ...linkCard('https://skip.example/archived'),
      status: 'archived',
    });
    const deleted = await createItem(ctx.t.db, deck, linkCard('https://skip.example/deleted'));
    await ctx.t.db.update(items).set({ deletedAt: state.now }).where(eq(items.id, deleted.id));

    const first = await sweeper().sweep();
    expect(first).toEqual({
      checked: LINK_CHECK_BATCH,
      ok: LINK_CHECK_BATCH,
      changed: 0,
      dead: 0,
      failing: 0,
      failedTemp: 0,
      unchecked: 0,
    });
    const second = await sweeper().sweep();
    expect(second.checked).toBe(20);
    // Everything was checked and is scheduled about a month out.
    expect((await sweeper().sweep()).checked).toBe(0);

    expect(site.requested.some((url) => url.includes('skip.example'))).toBe(false);
    expect(await ctx.t.db.select().from(linkChecks)).toHaveLength(total);
  });
});

describe('link check sweep results (D164)', () => {
  const site = fakeSite();
  const ctx = setupApiTest({ media: { linkCheckFetch: site.fetch, log: () => {} } });
  const { sweeper, advance } = sweepHarness(ctx, site);
  let deck: DeckRow;

  const checkRow = async (item: ItemRow) =>
    (await ctx.t.db.select().from(linkChecks).where(eq(linkChecks.itemId, item.id)))[0];

  beforeAll(async () => {
    await hideSampleLinks(ctx);
    deck = await createDeck(ctx.t.db, ctx.world.owner);
  });

  it('flags a link dead after two 404s in a row and clears it on a 200 (no media store)', async () => {
    const card = await createItem(ctx.t.db, deck, linkCard('https://flaky.example/gone'));
    site.status.set('/gone', 404);
    const linkHealth = async () => {
      const res = await ctx.app.request(`/items/${card.id}`, { headers: ctx.as() });
      expect(res.status).toBe(200);
      return (await json(res)).linkHealth;
    };

    const firstSweep = await sweeper().sweep();
    expect(firstSweep.failing).toBe(1);
    expect(await checkRow(card)).toMatchObject({
      status: 'ok',
      consecutiveFailures: 1,
      httpStatus: 404,
      flaggedAt: null,
    });
    expect(await linkHealth()).toBeNull();

    // The retry comes a day later; the other links are not due again yet.
    advance(DAY_MS + 60_000);
    const secondSweep = await sweeper().sweep();
    expect(secondSweep).toMatchObject({ checked: 1, dead: 1 });
    const dead = await checkRow(card);
    expect(dead).toMatchObject({ status: 'dead', consecutiveFailures: 2 });
    expect(await linkHealth()).toEqual({
      status: 'dead',
      checkedAt: dead!.checkedAt.toISOString(),
    });

    site.status.delete('/gone');
    advance(40 * DAY_MS);
    await sweeper().sweep();
    expect(await checkRow(card)).toMatchObject({
      status: 'ok',
      consecutiveFailures: 0,
      flaggedAt: null,
    });
    expect(await linkHealth()).toBeNull();
  });

  it('records a locked-host link as unchecked without a request and clears its flag (D168)', async () => {
    const card = await createItem(ctx.t.db, deck, linkCard('https://www.instagram.com/p/abc/'));
    await createLinkChecksRepo(ctx.t.db).upsert(card.id, {
      status: 'dead',
      httpStatus: 404,
      error: 'http_404',
      titleSeen: null,
      consecutiveFailures: 2,
      checkedAt: new Date(0),
      nextCheckAt: new Date(0),
      flaggedAt: new Date(0),
      dismissedAt: null,
    });
    site.requested.length = 0;

    const summary = await sweeper().sweep();
    expect(summary.unchecked).toBe(1);
    expect(site.requested.some((url) => url.includes('instagram'))).toBe(false);
    const row = await checkRow(card);
    expect(row).toMatchObject({
      status: 'unchecked',
      httpStatus: null,
      error: null,
      titleSeen: null,
      consecutiveFailures: 0,
      flaggedAt: null,
      dismissedAt: null,
    });
    const days = (row!.nextCheckAt.getTime() - row!.checkedAt.getTime()) / DAY_MS;
    expect(days).toBeGreaterThanOrEqual(27);
    expect(days).toBeLessThanOrEqual(33);

    const listed = await ctx.app.request(`/decks/${deck.id}/items?flag=link`, {
      headers: ctx.as(),
    });
    expect((await json(listed)).data).toEqual([]);
  });
});

describe('link check routes (D165)', () => {
  const site = fakeSite();
  const ctx = setupApiTest({ media: { linkCheckFetch: site.fetch, log: () => {} } });
  let deck: DeckRow;
  let reader: UserRow;
  const repo = () => createLinkChecksRepo(ctx.t.db);

  beforeAll(async () => {
    await hideSampleLinks(ctx);
    deck = await createDeck(ctx.t.db, ctx.world.owner);
    reader = await createAccountUser(ctx.t.db);
    await addMember(ctx.t.db, deck, reader, 'reader');
    await ctx.sessionFor(reader);
  });

  const check = (id: string, headers = ctx.as()) =>
    ctx.app.request(`/items/${id}/link-check`, { method: 'POST', headers });
  const dismiss = (id: string, headers = ctx.as()) =>
    ctx.app.request(`/items/${id}/link-check/flag`, { method: 'DELETE', headers });
  const flagged = (query = '', headers = ctx.as()) =>
    ctx.app.request(`/decks/${deck.id}/items?flag=link${query}`, { headers });

  /** Writes a check row directly (as a sweep would have). */
  async function seedCheck(
    item: ItemRow,
    status: LinkCheckStatus,
    flaggedAt: Date | null,
    dismissedAt: Date | null = null,
  ) {
    await repo().upsert(item.id, {
      status,
      httpStatus: status === 'dead' ? 404 : 200,
      error: status === 'dead' ? 'http_404' : null,
      titleSeen: null,
      consecutiveFailures: status === 'dead' ? 2 : 0,
      checkedAt: flaggedAt ?? new Date(),
      nextCheckAt: new Date(Date.now() + 30 * DAY_MS),
      flaggedAt,
      dismissedAt,
    });
  }

  describe('POST /items/{id}/link-check', () => {
    it('checks now and answers with the card', async () => {
      const card = await createItem(ctx.t.db, deck, linkCard('https://site.example/fine'));
      const res = await check(card.id);
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body).toMatchObject({ id: card.id, linkHealth: null });
      expect(await repo().find(card.id)).toMatchObject({ status: 'ok', httpStatus: 200 });
    });

    it('flags a renamed page as changed', async () => {
      site.titles.set('/renamed', 'A different article');
      const card = await createItem(ctx.t.db, deck, linkCard('https://site.example/renamed'));
      const body = await json(await check(card.id));
      expect(body.linkHealth).toMatchObject({ status: 'changed' });
    });

    it('never makes a link dead from manual checks', async () => {
      site.status.set('/missing', 404);
      const card = await createItem(ctx.t.db, deck, linkCard('https://site.example/missing'));
      await check(card.id);
      const res = await check(card.id);
      expect(res.status).toBe(200);
      expect((await json(res)).linkHealth).toBeNull();
      expect(await repo().find(card.id)).toMatchObject({ status: 'ok', consecutiveFailures: 2 });
    });

    it('404s for an unknown card, 422s for a non-link or archived card, 403s for readers', async () => {
      expect((await check('00000000-0000-4000-8000-000000000000')).status).toBe(404);

      const text = await createItem(ctx.t.db, deck, { card: { type: 'text', title: 'Note' } });
      const notLink = await check(text.id);
      expect(notLink.status).toBe(422);
      expect((await json(notLink)).errors).toEqual([
        { path: 'type', message: 'Only link cards can be checked' },
      ]);

      const archived = await createItem(ctx.t.db, deck, {
        ...linkCard('https://site.example/old'),
        status: 'archived',
      });
      expect((await check(archived.id)).status).toBe(422);

      const card = await createItem(ctx.t.db, deck, linkCard('https://site.example/fine'));
      expect((await check(card.id, ctx.as(reader.email))).status).toBe(403);
    });

    it(`refuses the ${LINK_CHECK_RATE_PER_HOUR + 1}th check in an hour`, async () => {
      const editor = await createAccountUser(ctx.t.db);
      await addMember(ctx.t.db, deck, editor, 'editor');
      await ctx.sessionFor(editor);
      const card = await createItem(ctx.t.db, deck, linkCard('https://site.example/fine'));

      for (let i = 0; i < LINK_CHECK_RATE_PER_HOUR; i++) {
        expect((await check(card.id, ctx.as(editor.email))).status).toBe(200);
      }
      const refused = await check(card.id, ctx.as(editor.email));
      expect(refused.status).toBe(429);
      expect((await json(refused)).type).toBe('/problems/rate-limited');
    });

    it('refuses locked hosts with their label, without a request or a rate-limit use (D168)', async () => {
      const editor = await createAccountUser(ctx.t.db);
      await addMember(ctx.t.db, deck, editor, 'editor');
      await ctx.sessionFor(editor);
      const locked = await createItem(ctx.t.db, deck, linkCard('https://vm.tiktok.com/abc/'));
      site.requested.length = 0;

      for (let i = 0; i <= LINK_CHECK_RATE_PER_HOUR; i++) {
        const res = await check(locked.id, ctx.as(editor.email));
        expect(res.status).toBe(422);
        expect(await json(res)).toMatchObject({
          type: '/problems/validation',
          detail: "Links to TikTok can't be checked automatically",
        });
      }
      expect(site.requested).toEqual([]);
      expect(await repo().find(locked.id)).toBeFalsy();

      const card = await createItem(ctx.t.db, deck, linkCard('https://site.example/fine'));
      expect((await check(card.id, ctx.as(editor.email))).status).toBe(200);
    });
  });

  describe('DELETE /items/{id}/link-check/flag', () => {
    it('dismisses an active flag until the status changes', async () => {
      site.titles.set('/moved', 'Moved somewhere else');
      const card = await createItem(ctx.t.db, deck, linkCard('https://site.example/moved'));
      expect((await json(await check(card.id))).linkHealth).toMatchObject({ status: 'changed' });

      expect((await dismiss(card.id)).status).toBe(204);
      const after = await ctx.app.request(`/items/${card.id}`, { headers: ctx.as() });
      expect((await json(after)).linkHealth).toBeNull();
      expect((await dismiss(card.id)).status).toBe(404);

      // Still `changed`: the dismissal holds.
      expect((await json(await check(card.id))).linkHealth).toBeNull();

      // Back to ok, then changed again: a new flag.
      site.titles.delete('/moved');
      await check(card.id);
      site.titles.set('/moved', 'Moved again');
      expect((await json(await check(card.id))).linkHealth).toMatchObject({ status: 'changed' });
    });

    it('404s when the card has no flag', async () => {
      const card = await createItem(ctx.t.db, deck, linkCard('https://site.example/fine'));
      expect((await dismiss(card.id)).status).toBe(404);
      await check(card.id);
      expect((await dismiss(card.id)).status).toBe(404);
    });
  });

  describe('GET /decks/{id}/items?flag=link', () => {
    let older: ItemRow;
    let newer: ItemRow;

    beforeAll(async () => {
      // Only the cards of this block are flagged from here on.
      await ctx.t.db.delete(linkChecks);
      older = await createItem(ctx.t.db, deck, linkCard('https://list.example/older'));
      newer = await createItem(ctx.t.db, deck, linkCard('https://list.example/newer'));
      await seedCheck(older, 'dead', new Date('2026-10-01T06:30:00.000Z'));
      await seedCheck(newer, 'changed', new Date('2026-10-05T06:30:00.000Z'));

      const dismissed = await createItem(
        ctx.t.db,
        deck,
        linkCard('https://list.example/dismissed'),
      );
      await seedCheck(dismissed, 'dead', new Date('2026-10-03T00:00:00.000Z'), new Date());
      const healthy = await createItem(ctx.t.db, deck, linkCard('https://list.example/healthy'));
      await seedCheck(healthy, 'ok', null);
      const archived = await createItem(ctx.t.db, deck, {
        ...linkCard('https://list.example/archived'),
        status: 'archived',
      });
      await seedCheck(archived, 'dead', new Date('2026-10-04T00:00:00.000Z'));
      const elsewhere = await createItem(
        ctx.t.db,
        await createDeck(ctx.t.db, ctx.world.owner),
        linkCard('https://list.example/elsewhere'),
      );
      await seedCheck(elsewhere, 'dead', new Date('2026-10-04T00:00:00.000Z'));
    });

    it('lists active flags of the deck, newest flag first, with their health', async () => {
      const res = await flagged();
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.data.map((i: { id: string }) => i.id)).toEqual([newer.id, older.id]);
      expect(body.data[0].linkHealth).toMatchObject({ status: 'changed' });
      expect(body.data[1].linkHealth).toMatchObject({ status: 'dead' });
      expect(body.nextCursor).toBeNull();
    });

    it('pages by flag time', async () => {
      const first = await json(await flagged('&limit=1'));
      expect(first.data.map((i: { id: string }) => i.id)).toEqual([newer.id]);
      const second = await json(
        await flagged(`&limit=1&cursor=${encodeURIComponent(first.nextCursor)}`),
      );
      expect(second.data.map((i: { id: string }) => i.id)).toEqual([older.id]);
    });

    it('needs item.update and rejects other statuses and types', async () => {
      expect((await flagged('', ctx.as(reader.email))).status).toBe(403);
      expect((await flagged('&status=archived')).status).toBe(400);
      expect((await flagged('&type=text')).status).toBe(400);
      expect((await flagged('&type=link')).status).toBe(200);
    });

    it('marks flagged cards in the ordinary list too', async () => {
      const body = await json(
        await ctx.app.request(`/decks/${deck.id}/items?type=link&limit=50`, {
          headers: ctx.as(),
        }),
      );
      const health = new Map(
        body.data.map((i: { id: string; linkHealth: unknown }) => [i.id, i.linkHealth]),
      );
      expect(health.get(newer.id)).toMatchObject({ status: 'changed' });
      expect(health.get(older.id)).toMatchObject({ status: 'dead' });
    });
  });
});
