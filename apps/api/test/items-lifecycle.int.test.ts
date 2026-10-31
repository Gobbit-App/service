import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { favorites, ingestJobs, itemCategories, items, type DeckRow } from '@gobbit/db';
import {
  addFavorite,
  addMember,
  createAccountUser,
  createCategory,
  createDeck,
  createItem,
  defaultCategory,
} from '@gobbit/db/test';
import { itemSchema, type MemberRole } from '@gobbit/shared';
import { createItemsRepo } from '../src/repositories/items.repo';
import { createPruneDeletedItems } from '../src/jobs/prune-deleted-items';
import { json, OTHER_EMAIL, OWNER_EMAIL, setupApiTest } from './helpers';

const DAY_MS = 86_400_000;

type Role = MemberRole | 'outsider';

/**
 * Phase 6 card lifecycle (D130–D132): archive/restore, delete/undelete, the deleted listing,
 * the weekly purge, and the same rules over cookie and bearer sessions.
 */
describe('item lifecycle (006)', () => {
  const ctx = setupApiTest();
  let deck: DeckRow;
  const emails = {} as Record<Role, string>;

  beforeAll(async () => {
    deck = await createDeck(ctx.t.db, ctx.world.owner, { slug: 'lifecycle' });
    emails.owner = OWNER_EMAIL;
    emails.outsider = OTHER_EMAIL;
    for (const role of ['maintainer', 'editor', 'reader'] as const) {
      const user = await createAccountUser(ctx.t.db, { email: `${role}-lc@example.test` });
      await addMember(ctx.t.db, deck, user, role);
      await ctx.sessionFor(user);
      emails[role] = user.email;
    }
  });

  const post = (path: string, role: Role, headers = ctx.as.bind(ctx)) =>
    ctx.app.request(path, { method: 'POST', headers: headers(emails[role]) });
  const del = (path: string, role: Role, headers = ctx.as.bind(ctx)) =>
    ctx.app.request(path, { method: 'DELETE', headers: headers(emails[role]) });
  const get = (path: string, role: Role, headers = ctx.as.bind(ctx)) =>
    ctx.app.request(path, { headers: headers(emails[role]) });

  const card = (title: string, opts: Parameters<typeof createItem>[2] = {}) =>
    createItem(ctx.t.db, deck, {
      card: { type: 'text', title, body: `${title} body` },
      createdBy: ctx.world.owner.id,
      verifiedAt: new Date('2026-01-02T03:04:05.000Z'),
      ...opts,
    });

  const listIds = async (status: string, role: Role = 'owner') => {
    const res = await get(`/decks/${deck.slug}/items?status=${status}&limit=50`, role);
    expect(res.status).toBe(200);
    return (await json(res)).data.map((i: { id: string }) => i.id) as string[];
  };

  const searchIds = async (q: string) => {
    const res = await get(`/decks/${deck.slug}/search?q=${encodeURIComponent(q)}`, 'owner');
    expect(res.status).toBe(200);
    return (await json(res)).data.map((h: { item: { id: string } }) => h.item.id) as string[];
  };

  const backdateDeletion = (id: string, days: number) =>
    ctx.t.db
      .update(items)
      .set({ deletedAt: new Date(Date.now() - days * DAY_MS) })
      .where(eq(items.id, id));

  describe('US1: archive and restore (D131)', () => {
    it.each(['owner', 'maintainer', 'editor'] as const)(
      '%s archives and restores; verifiedAt is unchanged',
      async (role) => {
        const item = await card(`Archive by ${role}`);

        const archived = await post(`/items/${item.id}/archive`, role);
        expect(archived.status).toBe(200);
        expect((await json(archived)).status).toBe('archived');

        const restored = await post(`/items/${item.id}/restore`, role);
        expect(restored.status).toBe(200);
        const body = itemSchema.parse(await json(restored));
        expect(body.status).toBe('published');
        expect(body.verifiedAt).toBe('2026-01-02T03:04:05.000Z');
        expect(body.deletedAt).toBeUndefined();
      },
    );

    it('reader gets 403 and an outsider 404 on archive and restore', async () => {
      const item = await card('Reader cannot archive');
      expect((await post(`/items/${item.id}/archive`, 'reader')).status).toBe(403);
      expect((await post(`/items/${item.id}/archive`, 'outsider')).status).toBe(404);

      await post(`/items/${item.id}/archive`, 'owner');
      expect((await post(`/items/${item.id}/restore`, 'reader')).status).toBe(403);
      expect((await post(`/items/${item.id}/restore`, 'outsider')).status).toBe(404);
    });

    it('archived cards leave the list and search, and come back after restore', async () => {
      const item = await card('Quokka feeding schedule');
      expect(await searchIds('quokka')).toContain(item.id);

      await post(`/items/${item.id}/archive`, 'editor');
      expect(await listIds('published')).not.toContain(item.id);
      expect(await listIds('archived')).toContain(item.id);
      expect(await searchIds('quokka')).not.toContain(item.id);

      await post(`/items/${item.id}/restore`, 'editor');
      expect(await listIds('published')).toContain(item.id);
      expect(await searchIds('quokka')).toContain(item.id);
    });

    it('archive and restore of a proposal are 409 invalid-transition', async () => {
      const item = await card('A proposal', { status: 'proposed', verifiedAt: null });
      for (const action of ['archive', 'restore']) {
        const res = await post(`/items/${item.id}/${action}`, 'owner');
        expect(res.status).toBe(409);
        expect((await json(res)).type).toBe('/problems/invalid-transition');
      }
    });

    it('PATCH archived → published is 409 use-restore and writes nothing', async () => {
      const item = await card('Patch restore');
      await post(`/items/${item.id}/archive`, 'owner');

      const res = await ctx.app.request(`/items/${item.id}`, {
        method: 'PATCH',
        headers: ctx.as(),
        body: JSON.stringify({ status: 'published', title: 'Renamed' }),
      });
      expect(res.status).toBe(409);
      expect((await json(res)).type).toBe('/problems/use-restore');

      const after = await json(await get(`/items/${item.id}`, 'owner'));
      expect(after).toMatchObject({ status: 'archived', title: 'Patch restore' });
    });
  });

  describe('US2: delete, undelete, deleted listing (D132)', () => {
    it.each(['owner', 'maintainer'] as const)(
      '%s deletes, sees it in the deleted listing, and undeletes',
      async (role) => {
        const item = await card(`Delete by ${role}`);

        expect((await del(`/items/${item.id}`, role)).status).toBe(204);
        expect(await listIds('published')).not.toContain(item.id);

        const listed = await json(await get(`/decks/${deck.slug}/items?status=deleted`, role));
        const row = listed.data.find((i: { id: string }) => i.id === item.id);
        expect(row).toMatchObject({ status: 'published' });
        expect(typeof row.deletedAt).toBe('string');

        const undone = await post(`/items/${item.id}/undelete`, role);
        expect(undone.status).toBe(200);
        expect((await json(undone)).deletedAt).toBeUndefined();
        expect(await listIds('published')).toContain(item.id);
      },
    );

    it.each(['editor', 'reader'] as const)(
      '%s gets 403 on delete, undelete and the listing',
      async (role) => {
        const item = await card(`No delete for ${role}`);
        expect((await del(`/items/${item.id}`, role)).status).toBe(403);
        expect((await get(`/decks/${deck.slug}/items?status=deleted`, role)).status).toBe(403);

        await del(`/items/${item.id}`, 'owner');
        expect((await post(`/items/${item.id}/undelete`, role)).status).toBe(403);
      },
    );

    it('outsider gets 404 on undelete and the listing', async () => {
      const item = await card('Outsider undelete');
      await del(`/items/${item.id}`, 'owner');
      expect((await post(`/items/${item.id}/undelete`, 'outsider')).status).toBe(404);
      expect((await get(`/decks/${deck.slug}/items?status=deleted`, 'outsider')).status).toBe(404);
    });

    it('the listing excludes proposals and rows older than 30 days; undelete 404/410 on them', async () => {
      const proposal = await card('Deleted proposal', { status: 'proposed', verifiedAt: null });
      const old = await card('Deleted long ago');
      await del(`/items/${proposal.id}`, 'owner');
      await del(`/items/${old.id}`, 'owner');
      await backdateDeletion(old.id, 31);

      const ids = await listIds('deleted');
      expect(ids).not.toContain(proposal.id);
      expect(ids).not.toContain(old.id);

      expect((await post(`/items/${proposal.id}/undelete`, 'owner')).status).toBe(404);
      const expired = await post(`/items/${old.id}/undelete`, 'owner');
      expect(expired.status).toBe(410);
      expect((await json(expired)).type).toBe('/problems/undo-expired');
    });

    it('the listing is newest-deleted first and pages with a cursor', async () => {
      const pagedDeck = await createDeck(ctx.t.db, ctx.world.owner);
      const rows = [];
      for (const [i, title] of ['First', 'Second', 'Third'].entries()) {
        const row = await createItem(ctx.t.db, pagedDeck, { card: { type: 'text', title } });
        await ctx.t.db
          .update(items)
          .set({ deletedAt: new Date(Date.now() - (3 - i) * 60_000) })
          .where(eq(items.id, row.id));
        rows.push(row);
      }

      const seen: string[] = [];
      let cursor: string | null = null;
      do {
        const qs = new URLSearchParams({ status: 'deleted', limit: '1' });
        if (cursor) qs.set('cursor', cursor);
        const page = await json(await get(`/decks/${pagedDeck.slug}/items?${qs}`, 'owner'));
        expect(page.data).toHaveLength(1);
        seen.push(page.data[0].id);
        cursor = page.nextCursor;
      } while (cursor);

      expect(seen).toEqual([rows[2].id, rows[1].id, rows[0].id]);
    });

    it('the listing hides cards in private categories from roles that cannot see them (repo)', async () => {
      // Every role with item.delete can read private categories, so the filter is checked at
      // the repository, which the deleted listing shares with the live list.
      const secret = await createCategory(ctx.t.db, deck, { visibility: 'private' });
      const item = await card('Private deleted', { categoryIds: [secret.id] });
      await del(`/items/${item.id}`, 'owner');

      const repo = createItemsRepo(ctx.t.db);
      const since = new Date(Date.now() - 30 * DAY_MS);
      const asOwner = await repo.listDeleted({
        role: 'owner',
        deckId: deck.id,
        deletedSince: since,
        limit: 50,
      });
      const asEditor = await repo.listDeleted({
        role: 'editor',
        deckId: deck.id,
        deletedSince: since,
        limit: 50,
      });
      expect(asOwner.map((r) => r.id)).toContain(item.id);
      expect(asEditor.map((r) => r.id)).not.toContain(item.id);
    });

    it('undelete restores status, categories and favorites', async () => {
      const extra = await createCategory(ctx.t.db, deck);
      const general = await defaultCategory(ctx.t.db, deck);
      const item = await card('Archived then deleted', {
        status: 'archived',
        categoryIds: [general.id, extra.id],
      });
      await addFavorite(ctx.t.db, ctx.world.owner, item);

      await del(`/items/${item.id}`, 'owner');
      const body = await json(await post(`/items/${item.id}/undelete`, 'owner'));

      expect(body.status).toBe('archived');
      expect([...body.categoryIds].sort()).toEqual([general.id, extra.id].sort());
      expect(body.isFavorite).toBe(true);
      expect(body.verifiedAt).toBe('2026-01-02T03:04:05.000Z');
    });

    it('undelete is 422 item-needs-category when a published card lost its category links', async () => {
      const item = await card('Lost its links');
      await del(`/items/${item.id}`, 'owner');
      await ctx.t.db.delete(itemCategories).where(eq(itemCategories.itemId, item.id));

      const res = await post(`/items/${item.id}/undelete`, 'owner');
      expect(res.status).toBe(422);
      expect((await json(res)).type).toBe('/problems/item-needs-category');
    });

    it('the purge job removes rows deleted > 30 days ago with cascades and set-nulls', async () => {
      const old = await card('Purge me');
      const recent = await card('Keep me');
      await addFavorite(ctx.t.db, ctx.world.owner, old);
      const [job] = await ctx.t.db
        .insert(ingestJobs)
        .values({
          deckId: deck.id,
          userId: ctx.world.owner.id,
          channel: 'paste',
          resultItemId: old.id,
        })
        .returning();
      await del(`/items/${old.id}`, 'owner');
      await del(`/items/${recent.id}`, 'owner');
      await backdateDeletion(old.id, 31);

      const purged = await createPruneDeletedItems({
        items: createItemsRepo(ctx.t.db),
        log: () => undefined,
      })();

      expect(purged).toBeGreaterThanOrEqual(1);
      const remaining = await ctx.t.db
        .select({ id: items.id })
        .from(items)
        .where(eq(items.deckId, deck.id));
      expect(remaining.map((r) => r.id)).not.toContain(old.id);
      expect(remaining.map((r) => r.id)).toContain(recent.id);
      expect(await ctx.t.db.select().from(favorites).where(eq(favorites.itemId, old.id))).toEqual(
        [],
      );
      const [after] = await ctx.t.db.select().from(ingestJobs).where(eq(ingestJobs.id, job.id));
      expect(after.resultItemId).toBeNull();
    });
  });

  describe('US3: the same rules for every client (D130)', () => {
    type Headers = (email?: string) => Record<string, string>;
    const clients: Array<[string, () => Headers]> = [
      ['bearer', () => ctx.as.bind(ctx)],
      ['cookie', () => ctx.asCookie.bind(ctx)],
    ];

    /** archive → restore → delete → undelete, each sent twice; returns status codes and bodies. */
    async function runSequence(role: Role, headers: Headers) {
      const item = await card(`Sequence ${role}`);
      const steps: Array<[string, () => Response | Promise<Response>]> = [
        ['archive', () => post(`/items/${item.id}/archive`, role, headers)],
        ['restore', () => post(`/items/${item.id}/restore`, role, headers)],
        ['delete', () => del(`/items/${item.id}`, role, headers)],
        ['undelete', () => post(`/items/${item.id}/undelete`, role, headers)],
      ];
      const result: Array<{ step: string; status: number; body: unknown }> = [];
      for (const [step, send] of steps) {
        for (let i = 0; i < 2; i++) {
          const res = await send();
          const body = res.status === 204 ? null : await json(res);
          result.push({ step, status: res.status, body: normalize(body) });
        }
        // Owner-assisted delete for roles that can't, so their undelete is still exercised
        if (step === 'delete' && !['owner', 'maintainer'].includes(role)) {
          await del(`/items/${item.id}`, 'owner');
        }
      }
      return result;
    }

    /** Drops per-item and per-run fields so two runs compare equal. */
    function normalize(body: unknown) {
      if (!body || typeof body !== 'object') return body;
      const {
        id: _id,
        title: _t,
        body: _b,
        createdAt: _c,
        updatedAt: _u,
        categoryIds: _ci,
        ...rest
      } = body as Record<string, unknown>;
      return rest;
    }

    const expected: Record<Role, number[]> = {
      owner: [200, 200, 200, 200, 204, 404, 200, 200],
      maintainer: [200, 200, 200, 200, 204, 404, 200, 200],
      editor: [200, 200, 200, 200, 403, 403, 403, 403],
      reader: [403, 403, 403, 403, 403, 403, 403, 403],
      outsider: [404, 404, 404, 404, 404, 404, 404, 404],
    };

    it.each(Object.keys(expected) as Role[])(
      '%s: cookie and bearer give identical results',
      async (role) => {
        const [bearer, cookie] = await Promise.all(
          clients.map(async ([, headers]) => runSequence(role, headers())),
        );
        expect(bearer.map((r) => r.status)).toEqual(expected[role]);
        expect(cookie).toEqual(bearer);
      },
    );

    it('an ing_ ingest token gets 401 on every lifecycle route', async () => {
      const created = await ctx.app.request('/me/ingest-tokens', {
        method: 'POST',
        headers: ctx.as(),
        body: JSON.stringify({ label: 'lifecycle', deckId: deck.id }),
      });
      expect(created.status).toBe(201);
      const { token } = await json(created);
      const item = await card('Ingest token target');
      const auth = { Authorization: `Bearer ${token}` };

      const requests: Array<[string, string]> = [
        ['POST', `/items/${item.id}/archive`],
        ['POST', `/items/${item.id}/restore`],
        ['DELETE', `/items/${item.id}`],
        ['POST', `/items/${item.id}/undelete`],
        ['GET', `/decks/${deck.slug}/items?status=deleted`],
      ];
      for (const [method, path] of requests) {
        expect((await ctx.app.request(path, { method, headers: auth })).status).toBe(401);
      }
    });
  });
});
