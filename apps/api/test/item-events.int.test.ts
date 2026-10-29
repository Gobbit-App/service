import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { itemEvents, items, users, type DeckRow, type UserRow } from '@gobbit/db';
import { addMember, createAccountUser, createCategory, createDeck } from '@gobbit/db/test';
import { itemEventPageSchema, type ItemEvent } from '@gobbit/shared';
import { buildServices } from '../src/services';
import { createItemsRepo } from '../src/repositories/items.repo';
import { createPruneDeletedItems } from '../src/jobs/prune-deleted-items';
import { json, OTHER_EMAIL, setupApiTest } from './helpers';

const DAY_MS = 86_400_000;

/** 020 (D186–D188): one log line per card change, read by owners and maintainers. */
describe('item events (020)', () => {
  const ctx = setupApiTest();
  let ingest: ReturnType<typeof buildServices>['ingest'];
  let maintainer: UserRow;
  let editor: UserRow;
  let reader: UserRow;
  let deck: DeckRow;

  beforeAll(async () => {
    ingest = buildServices({
      db: ctx.t.db,
      env: ctx.env,
      mailer: ctx.mailer,
      now: ctx.clock.now,
      search: { embedder: null },
    }).ingest;
    maintainer = await createAccountUser(ctx.t.db, { displayName: 'Maya Maintainer' });
    editor = await createAccountUser(ctx.t.db, { displayName: 'Eli Editor' });
    reader = await createAccountUser(ctx.t.db);
    for (const user of [maintainer, editor, reader]) await ctx.sessionFor(user);
  });

  // A fresh deck per test keeps each log independent.
  beforeEach(async () => {
    deck = await createDeck(ctx.t.db, ctx.world.owner);
    await addMember(ctx.t.db, deck, maintainer, 'maintainer');
    await addMember(ctx.t.db, deck, editor, 'editor');
    await addMember(ctx.t.db, deck, reader, 'reader');
  });

  const send = (method: string, path: string, body?: unknown, email?: string) =>
    ctx.app.request(path, {
      method,
      headers: ctx.as(email),
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  async function createCard(title: string, extra: Record<string, unknown> = {}, email?: string) {
    const res = await send(
      'POST',
      `/decks/${deck.id}/items`,
      { type: 'text', title, body: `${title} body`, ...extra },
      email,
    );
    expect(res.status).toBe(201);
    return (await json(res)) as { id: string };
  }

  async function log(query = '', email?: string): Promise<ItemEvent[]> {
    const res = await send('GET', `/decks/${deck.id}/events${query}`, undefined, email);
    expect(res.status).toBe(200);
    return itemEventPageSchema.parse(await json(res)).data;
  }

  function propose(targetItemId?: string) {
    return ingest.proposeDirect({
      user: editor,
      deck: deck.id,
      draft: { type: 'text', title: 'Dan the Plumber', body: '050-1234567', payload: {} },
      channel: 'pwa',
      targetItemId,
    });
  }

  describe('writes (T010)', () => {
    it('logs created, updated, archived, restored, deleted and undeleted for a session', async () => {
      const card = await createCard('Plumber');
      await send('PATCH', `/items/${card.id}`, { title: 'Plumber Dan', body: 'new' });
      await send('POST', `/items/${card.id}/archive`);
      await send('POST', `/items/${card.id}/restore`, undefined, maintainer.email);
      await send('DELETE', `/items/${card.id}`);
      await send('POST', `/items/${card.id}/undelete`);

      const lines = await log();
      expect(lines.map((l) => l.kind)).toEqual([
        'undeleted',
        'deleted',
        'restored',
        'archived',
        'updated',
        'created',
      ]);
      expect(lines.every((l) => l.itemId === card.id && l.via === 'session')).toBe(true);
      expect(lines.find((l) => l.kind === 'updated')).toMatchObject({
        title: 'Plumber Dan',
        changes: ['title', 'body'],
      });
      expect(lines.find((l) => l.kind === 'created')).toMatchObject({
        title: 'Plumber',
        changes: [],
        actor: { userId: ctx.world.owner.id },
      });
      expect(lines.find((l) => l.kind === 'restored')?.actor).toEqual({
        userId: maintainer.id,
        displayName: 'Maya Maintainer',
      });
    });

    it('logs categories as a set change and a status move as its own line', async () => {
      const other = await createCategory(ctx.t.db, deck, { name: 'Trades' });
      const card = await createCard('Proposal', { status: 'proposed' });
      await send('PATCH', `/items/${card.id}`, {
        title: 'Proposal 2',
        categoryIds: [other.id],
        status: 'published',
      });

      const [published, updated] = await log();
      expect(published).toMatchObject({ kind: 'published', changes: [] });
      expect(updated).toMatchObject({ kind: 'updated', changes: ['title', 'categories'] });
    });

    it('logs one categories line per instant save and another for its Undo (023)', async () => {
      const trades = await createCategory(ctx.t.db, deck, { name: 'Trades' });
      const home = await createCategory(ctx.t.db, deck, { name: 'Home' });
      const card = await createCard('Plumber', { categoryIds: [trades.id] });
      const save = async (categoryIds: string[]) => {
        const res = await send('PATCH', `/items/${card.id}`, { categoryIds });
        expect(res.status).toBe(200);
      };
      await save([trades.id, home.id]);
      await save([home.id]);
      await save([trades.id, home.id]); // Undo restores the set before the burst

      const updates = (await log()).filter((l) => l.kind === 'updated');
      expect(updates).toHaveLength(3);
      for (const line of updates) expect(line.changes).toEqual(['categories']);
    });

    it('logs proposed (via ingest), published and discarded for the review flow', async () => {
      const kept = await propose();
      const dropped = await propose();
      expect((await send('POST', `/items/${kept.itemId}/publish`, {})).status).toBe(200);
      expect((await send('POST', `/items/${dropped.itemId}/discard`)).status).toBe(204);

      const lines = await log();
      expect(lines.map((l) => [l.kind, l.itemId])).toEqual([
        ['discarded', dropped.itemId],
        ['published', kept.itemId],
        ['proposed', dropped.itemId],
        ['proposed', kept.itemId],
      ]);
      const proposed = lines.find((l) => l.kind === 'proposed')!;
      expect(proposed).toMatchObject({ via: 'ingest', actor: { userId: editor.id } });
      expect(lines.find((l) => l.kind === 'published')).toMatchObject({
        via: 'session',
        actor: { userId: ctx.world.owner.id },
      });
    });

    it('logs one merged line on the target and none for the merged proposal', async () => {
      const target = await createCard('Dan (old)');
      const { itemId } = await propose(target.id);
      const res = await send('POST', `/items/${itemId}/publish`, { mode: 'update' });
      expect(res.status).toBe(200);

      const [merged, ...rest] = await log();
      expect(merged).toMatchObject({ kind: 'merged', itemId: target.id });
      expect(merged!.changes).toEqual(expect.arrayContaining(['title', 'body']));
      expect(rest.map((l) => l.kind)).toEqual(['proposed', 'created']);
    });

    it('logs nothing for a no-op save, a refused write or a system write', async () => {
      const card = await createCard('Quiet');
      const noop = await send('PATCH', `/items/${card.id}`, { title: 'Quiet' });
      expect(noop.status).toBe(200);

      const foreign = await createCategory(ctx.t.db, await createDeck(ctx.t.db, ctx.world.owner));
      const refused = await send('PATCH', `/items/${card.id}`, {
        title: 'Loud',
        categoryIds: [foreign.id],
      });
      expect(refused.status).toBeGreaterThanOrEqual(400);

      // The link-snapshot job writes the payload through updatePayloadIf (D187: system writes).
      const [row] = await ctx.t.db.select().from(items).where(eq(items.id, card.id));
      await createItemsRepo(ctx.t.db).updatePayloadIf(card.id, row!.updatedAt, { system: true });

      expect((await log()).map((l) => l.kind)).toEqual(['created']);
    });
  });

  describe('reads (T011, T020)', () => {
    it('pages newest first with a cursor that is stable across new lines', async () => {
      const ids: string[] = [];
      for (let i = 0; i < 5; i += 1) {
        ids.push((await createCard(`Card ${i}`)).id);
        ctx.clock.advance(1000);
      }
      const first = await json(await send('GET', `/decks/${deck.id}/events?limit=2`));
      expect(first.data.map((l: ItemEvent) => l.itemId)).toEqual([ids[4], ids[3]]);
      expect(first.nextCursor).toEqual(expect.any(String));

      await createCard('Late');
      const second = await json(
        await send('GET', `/decks/${deck.id}/events?limit=2&cursor=${first.nextCursor}`),
      );
      expect(second.data.map((l: ItemEvent) => l.itemId)).toEqual([ids[2], ids[1]]);

      const third = await json(
        await send('GET', `/decks/${deck.id}/events?limit=2&cursor=${second.nextCursor}`),
      );
      expect(third.data.map((l: ItemEvent) => l.itemId)).toEqual([ids[0]]);
      expect(third.nextCursor).toBeNull();
    });

    it('also resolves the deck by slug', async () => {
      await createCard('Slugged');
      const res = await send('GET', `/decks/${deck.slug}/events`);
      expect((await json(res)).data).toHaveLength(1);
    });

    it('narrows to one card with itemId', async () => {
      const a = await createCard('A');
      await createCard('B');
      await send('PATCH', `/items/${a.id}`, { body: 'changed' });

      const lines = await log(`?itemId=${a.id}`);
      expect(lines.map((l) => l.kind)).toEqual(['updated', 'created']);
      expect(lines.every((l) => l.itemId === a.id)).toBe(true);
    });

    it('rejects a bad cursor, limit or itemId with 400', async () => {
      for (const q of ['?cursor=nope', '?limit=0', '?limit=51', '?itemId=abc']) {
        expect((await send('GET', `/decks/${deck.id}/events${q}`)).status, q).toBe(400);
      }
    });

    it('is for owners and maintainers only: editor/reader 403, non-member 404, anon 401', async () => {
      await createCard('Private');
      expect(await log('', maintainer.email)).toHaveLength(1);
      for (const email of [editor.email, reader.email]) {
        expect((await send('GET', `/decks/${deck.id}/events`, undefined, email)).status).toBe(403);
      }
      expect((await send('GET', `/decks/${deck.id}/events`, undefined, OTHER_EMAIL)).status).toBe(
        404,
      );
      const anon = await ctx.app.request(`/decks/${deck.id}/events`, { headers: ctx.anon() });
      expect(anon.status).toBe(401);
    });

    it('keeps the line with itemId null after a purge', async () => {
      const card = await createCard('Gone');
      await send('DELETE', `/items/${card.id}`);
      await ctx.t.db
        .update(items)
        .set({ deletedAt: new Date(Date.now() - 31 * DAY_MS) })
        .where(eq(items.id, card.id));
      await createPruneDeletedItems({ items: createItemsRepo(ctx.t.db), log: () => undefined })();

      const lines = await log();
      expect(lines.map((l) => [l.kind, l.itemId, l.title])).toEqual([
        ['deleted', null, 'Gone'],
        ['created', null, 'Gone'],
      ]);
    });

    it('shows a deleted account as a null actor', async () => {
      const gone = await createAccountUser(ctx.t.db, { displayName: 'Gone Member' });
      await addMember(ctx.t.db, deck, gone, 'editor');
      await ctx.sessionFor(gone);
      await createCard('Left behind', {}, gone.email);
      await ctx.t.db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, gone.id));

      expect((await log())[0]).toMatchObject({ kind: 'created', actor: null });
      const [row] = await ctx.t.db.select().from(itemEvents).where(eq(itemEvents.deckId, deck.id));
      expect(row!.actorUserId).toBe(gone.id);
    });
  });
});
