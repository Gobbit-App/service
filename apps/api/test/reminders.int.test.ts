import { beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { items, reminders, type CategoryRow, type DeckRow } from '@gobbit/db';
import { addMember, createAccountUser, createCategory, createDeck } from '@gobbit/db/test';
import { itemEventPageSchema, itemSchema, type Item, type MemberRole } from '@gobbit/shared';
import { json, setupApiTest } from './helpers';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

type Role = MemberRole;

/**
 * 037 reminders (T013/T016): hidden until reveal for everyone but the creator and private-category
 * roles, the Upcoming list, never public, and dismissing (D291–D294).
 */
describe('reminders (037)', () => {
  const ctx = setupApiTest();
  let deck: DeckRow;
  let publicDeck: DeckRow;
  let publicCategory: CategoryRow;
  const emails = {} as Record<Role, string>;
  const ids = {} as Record<Role, string>;

  beforeAll(async () => {
    deck = await createDeck(ctx.t.db, ctx.world.owner, { slug: 'reminders', kind: 'shared' });
    emails.owner = ctx.world.owner.email;
    ids.owner = ctx.world.owner.id;
    for (const role of ['maintainer', 'editor', 'reader'] as const) {
      const user = await createAccountUser(ctx.t.db, { email: `${role}-rem@example.test` });
      await addMember(ctx.t.db, deck, user, role);
      await ctx.sessionFor(user);
      emails[role] = user.email;
      ids[role] = user.id;
    }
    publicDeck = await createDeck(ctx.t.db, ctx.world.owner, {
      slug: 'street-reminders',
      kind: 'communal',
      isPublic: true,
    });
    publicCategory = await createCategory(ctx.t.db, publicDeck, {
      slug: 'notices',
      visibility: 'public',
    });
  });

  const request = (method: string, path: string, role: Role, body?: unknown) =>
    ctx.app.request(path, {
      method,
      headers: ctx.as(emails[role]),
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  /** Deadline `inMs` from now, shown `showBeforeHours` before (revealed when it's ≥ inMs). */
  async function createReminder(
    role: Role,
    title: string,
    opts: {
      inMs?: number;
      showBeforeHours?: number;
      dismiss?: { mode: 'me' | 'writers' | 'people'; userIds?: string[] };
      deckSlug?: string;
      categoryIds?: string[];
    } = {},
  ): Promise<Item> {
    const res = await request('POST', `/decks/${opts.deckSlug ?? deck.slug}/items`, role, {
      type: 'reminder',
      title,
      ...(opts.categoryIds ? { categoryIds: opts.categoryIds } : {}),
      payload: {
        deadline: new Date(Date.now() + (opts.inMs ?? 3 * DAY_MS)).toISOString(),
        showBefore: { amount: opts.showBeforeHours ?? 24, unit: 'hours' },
        dismiss: { userIds: [], ...(opts.dismiss ?? { mode: 'writers' }) },
        timeZone: 'Europe/London',
      },
    });
    expect(res.status).toBe(201);
    return itemSchema.parse(await json(res));
  }

  const listIds = async (role: Role, query = 'status=published') => {
    const res = await request('GET', `/decks/${deck.slug}/items?${query}&limit=50`, role);
    expect(res.status).toBe(200);
    return (await json(res)).data.map((i: { id: string }) => i.id) as string[];
  };

  const searchIds = async (role: Role, q: string) => {
    const res = await request('GET', `/decks/${deck.slug}/search?q=${encodeURIComponent(q)}`, role);
    expect(res.status).toBe(200);
    return (await json(res)).data.map((h: { item: { id: string } }) => h.item.id) as string[];
  };

  const moveDeadlineToPast = (itemId: string) =>
    ctx.t.db.execute(sql`
      update items
         set payload = jsonb_set(payload, '{deadline}', to_jsonb((now() - interval '1 hour')::text))
       where id = ${itemId}
    `);

  describe('T013: hidden until reveal (D292)', () => {
    let hidden: Item;
    let revealed: Item;

    beforeAll(async () => {
      hidden = await createReminder('editor', 'Renew the zebra licence');
      revealed = await createReminder('editor', 'Water the zebra plants', {
        inMs: 2 * HOUR_MS,
        showBeforeHours: 24,
      });
      await request('POST', `/items/${hidden.id}/favorite`, 'reader');
    });

    it('the create response carries the reminder state', () => {
      expect(hidden.reminder).toMatchObject({ state: 'pending', hidden: true, canDismiss: true });
      expect(revealed.reminder).toMatchObject({ state: 'pending', hidden: false });
    });

    it('a hidden reminder is off lists, search and favorites for everyone', async () => {
      for (const role of ['owner', 'editor', 'reader'] as const) {
        expect(await listIds(role)).not.toContain(hidden.id);
        expect(await listIds(role)).toContain(revealed.id);
        expect(await searchIds(role, 'zebra')).not.toContain(hidden.id);
      }
      expect(await listIds('reader', 'favorite=true')).not.toContain(hidden.id);
    });

    it('only the creator and private-category roles open it by id', async () => {
      for (const role of ['owner', 'maintainer', 'editor'] as const) {
        expect((await request('GET', `/items/${hidden.id}`, role)).status).toBe(200);
      }
      expect((await request('GET', `/items/${hidden.id}`, 'reader')).status).toBe(404);
      expect((await request('GET', `/items/${revealed.id}`, 'reader')).status).toBe(200);
    });

    it('Upcoming: owners and maintainers see all, others only their own', async () => {
      expect(await listIds('owner', 'status=upcoming')).toContain(hidden.id);
      expect(await listIds('maintainer', 'status=upcoming')).toContain(hidden.id);
      expect(await listIds('editor', 'status=upcoming')).toContain(hidden.id);
      expect(await listIds('reader', 'status=upcoming')).not.toContain(hidden.id);
      expect(await listIds('owner', 'status=upcoming')).not.toContain(revealed.id);

      const ownersOnly = await createReminder('owner', 'Owner secret');
      expect(await listIds('editor', 'status=upcoming')).not.toContain(ownersOnly.id);
    });

    it('reminders are never public: public reads, counts, sitemap and share previews', async () => {
      const reminder = await createReminder('owner', 'Public bin day', {
        deckSlug: publicDeck.slug,
        categoryIds: [publicCategory.id],
        inMs: 2 * HOUR_MS,
      });

      const list = await ctx.app.request(`/public/${publicDeck.slug}/items`, {
        headers: ctx.anon(),
      });
      expect(list.status).toBe(200);
      expect(JSON.stringify(await json(list))).not.toContain(reminder.id);

      const one = await ctx.app.request(`/public/${publicDeck.slug}/items/${reminder.id}`, {
        headers: ctx.anon(),
      });
      expect(one.status).toBe(404);

      const deckRes = await json(
        await ctx.app.request(`/public/${publicDeck.slug}`, { headers: ctx.anon() }),
      );
      const notices = deckRes.categories.find((c: { slug: string }) => c.slug === 'notices');
      expect(notices?.itemCount ?? 0).toBe(0);

      const sitemap = await (await ctx.app.request('/sitemap.xml')).text();
      expect(sitemap).not.toContain(reminder.id);

      const share = await (
        await ctx.app.request(`/s/${reminder.id}`, { headers: ctx.anon() })
      ).text();
      expect(share).not.toContain('Public bin day');
    });
  });

  describe('T016: dismiss (D294)', () => {
    it('a reader is not an eligible dismisser of a writers-only reminder (403)', async () => {
      const r = await createReminder('editor', 'Writers only', { inMs: HOUR_MS });
      const res = await request('POST', `/items/${r.id}/dismiss`, 'reader', { done: false });
      expect(res.status).toBe(403);
      expect((await json(res)).type).toBe('/problems/not-a-dismisser');
    });

    it('an eligible dismisser marks it done: outcome, archive and activity event', async () => {
      const r = await createReminder('editor', 'Pay the plumber', { inMs: HOUR_MS });
      const res = await request('POST', `/items/${r.id}/dismiss`, 'maintainer', {
        done: true,
        resolution: '  Paid by transfer  ',
      });
      expect(res.status).toBe(200);
      const body = itemSchema.parse(await json(res));
      expect(body.status).toBe('archived');
      expect(body.reminder).toMatchObject({
        state: 'done',
        dismissedBy: ids.maintainer,
        resolution: 'Paid by transfer',
        canDismiss: false,
      });

      const again = await request('POST', `/items/${r.id}/dismiss`, 'owner', { done: false });
      expect(again.status).toBe(409);

      const events = itemEventPageSchema.parse(
        await json(await request('GET', `/decks/${deck.id}/events?limit=50`, 'owner')),
      ).data;
      expect(events.find((e) => e.itemId === r.id && e.kind === 'completed')).toBeDefined();
    });

    it('"people" lets only the picked writers dismiss', async () => {
      const r = await createReminder('owner', 'Picked people', {
        inMs: HOUR_MS,
        dismiss: { mode: 'people', userIds: [ids.editor] },
      });
      expect(
        (await request('POST', `/items/${r.id}/dismiss`, 'maintainer', { done: false })).status,
      ).toBe(403);
      const ok = await request('POST', `/items/${r.id}/dismiss`, 'editor', { done: false });
      expect(ok.status).toBe(200);
      expect((await json(ok)).reminder.state).toBe('dismissed');
    });

    it('picking a reader is 422', async () => {
      const res = await request('POST', `/decks/${deck.slug}/items`, 'owner', {
        type: 'reminder',
        title: 'Bad pick',
        payload: {
          deadline: new Date(Date.now() + DAY_MS).toISOString(),
          showBefore: { amount: 1, unit: 'hours' },
          dismiss: { mode: 'people', userIds: [ids.reader] },
          timeZone: 'UTC',
        },
      });
      expect(res.status).toBe(422);
    });

    it('restore reopens it; after the deadline it is marked notified (no late notification)', async () => {
      const r = await createReminder('editor', 'Reopen me', { inMs: HOUR_MS });
      await request('POST', `/items/${r.id}/dismiss`, 'editor', { done: true });
      await moveDeadlineToPast(r.id);

      const res = await request('POST', `/items/${r.id}/restore`, 'editor');
      expect(res.status).toBe(200);
      const body = itemSchema.parse(await json(res));
      expect(body.status).toBe('published');
      expect(body.reminder).toMatchObject({ state: 'pending', resolution: null, canDismiss: true });

      const [row] = await ctx.t.db
        .select({ deadline: reminders.deadline, notified: reminders.notifiedDeadline })
        .from(reminders)
        .where(eq(reminders.itemId, r.id));
      expect(row!.notified?.getTime()).toBe(row!.deadline.getTime());
    });

    it('an editor deletes their own reminder but not someone else’s', async () => {
      const own = await createReminder('editor', 'Mine to delete');
      const other = await createReminder('maintainer', 'Not yours', { inMs: HOUR_MS });
      expect((await request('DELETE', `/items/${own.id}`, 'editor')).status).toBe(204);
      expect((await request('DELETE', `/items/${other.id}`, 'editor')).status).toBe(403);

      const [row] = await ctx.t.db
        .select({ deletedAt: items.deletedAt })
        .from(items)
        .where(eq(items.id, own.id));
      expect(row!.deletedAt).not.toBeNull();
    });

    it('dismissing a non-reminder is 409', async () => {
      const res = await request('POST', `/decks/${deck.slug}/items`, 'owner', {
        type: 'text',
        title: 'Plain',
        body: 'card',
      });
      const card = await json(res);
      const dismiss = await request('POST', `/items/${card.id}/dismiss`, 'owner', { done: false });
      expect(dismiss.status).toBe(409);
    });
  });
});
