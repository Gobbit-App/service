import { beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import type { DeckRow, UserRow } from '@gobbit/db';
import { addMember, createAccountUser, createDeck } from '@gobbit/db/test';
import { itemSchema, pendingListSchema, type Item, type PendingList } from '@gobbit/shared';
import { json, setupApiTest } from './helpers';

const HOUR_MS = 3_600_000;
type Role = 'owner' | 'maintainer' | 'editor' | 'reader';

/** 037 pending list (T028–T029, D298): what the bell and /notifications show each member. */
describe('GET /me/pending (037)', () => {
  const ctx = setupApiTest();
  let deck: DeckRow;
  const emails = {} as Record<Role | 'stranger', string>;
  const titles = (list: PendingList['items']) => list.map((p) => p.title);

  const request = (method: string, path: string, email: string, body?: unknown) =>
    ctx.app.request(path, {
      method,
      headers: ctx.as(email),
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  async function createReminder(
    deckSlug: string,
    email: string,
    title: string,
    o: { dueInHours: number; showBeforeHours: number; mode?: 'me' | 'writers' },
  ): Promise<Item> {
    const res = await request('POST', `/decks/${deckSlug}/items`, email, {
      type: 'reminder',
      title,
      payload: {
        deadline: new Date(Date.now() + o.dueInHours * HOUR_MS).toISOString(),
        showBefore: { amount: o.showBeforeHours, unit: 'hours' },
        dismiss: { mode: o.mode ?? 'writers', userIds: [] },
        timeZone: 'Europe/London',
      },
    });
    expect(res.status).toBe(201);
    return itemSchema.parse(await json(res));
  }

  /** The server-owned deadline passes (the list reads `reminders.deadline`). */
  async function makeOverdue(itemId: string): Promise<void> {
    await ctx.t.db.execute(sql`
      update reminders set deadline = now() - interval '5 minutes' where item_id = ${itemId}
    `);
  }

  async function pendingFor(email: string): Promise<PendingList> {
    const res = await request('GET', '/me/pending', email);
    expect(res.status).toBe(200);
    return pendingListSchema.parse(await json(res));
  }

  beforeAll(async () => {
    deck = await createDeck(ctx.t.db, ctx.world.owner, { slug: 'pending', kind: 'shared' });
    emails.owner = ctx.world.owner.email;
    for (const role of ['maintainer', 'editor', 'reader'] as const) {
      const user: UserRow = await createAccountUser(ctx.t.db, {
        email: `${role}-pending@example.test`,
      });
      await addMember(ctx.t.db, deck, user, role);
      await ctx.sessionFor(user);
      emails[role] = user.email;
    }
    emails.stranger = ctx.world.other.email;

    // Due later, already shown: waiting on every writer.
    await createReminder(deck.slug, emails.editor, 'Soon for all', {
      dueInHours: 1,
      showBeforeHours: 2,
    });
    // Overdue: listed first.
    const overdue = await createReminder(deck.slug, emails.editor, 'Late for all', {
      dueInHours: 3,
      showBeforeHours: 4,
    });
    await makeOverdue(overdue.id);
    // Only the editor may dismiss it.
    await createReminder(deck.slug, emails.editor, 'Editor only', {
      dueInHours: 2,
      showBeforeHours: 3,
      mode: 'me',
    });
    // Not shown yet: Upcoming for its creator only.
    await createReminder(deck.slug, emails.editor, 'Hidden by editor', {
      dueInHours: 72,
      showBeforeHours: 1,
    });
    // Dismissed: gone everywhere.
    const done = await createReminder(deck.slug, emails.editor, 'Already done', {
      dueInHours: 1,
      showBeforeHours: 2,
    });
    const dismissed = await request('POST', `/items/${done.id}/dismiss`, emails.owner, {
      done: true,
    });
    expect(dismissed.status).toBe(200);

    // Another account's deck: none of the people above are members.
    const other = await createDeck(ctx.t.db, ctx.world.other, {
      slug: 'pending-other',
      kind: 'shared',
    });
    await createReminder(other.slug, emails.stranger, 'Elsewhere', {
      dueInHours: 1,
      showBeforeHours: 2,
    });
  });

  it('lists what the editor may dismiss, overdue first, and their hidden ones as Upcoming', async () => {
    const list = await pendingFor(emails.editor);
    expect(titles(list.items)).toEqual(['Late for all', 'Soon for all', 'Editor only']);
    expect(list.items.map((p) => p.overdue)).toEqual([true, false, false]);
    expect(list.items[0]).toMatchObject({ kind: 'reminder', deck: { slug: 'pending' } });
    expect(titles(list.upcoming)).toEqual(['Hidden by editor']);
  });

  it('leaves out reminders someone else is meant to dismiss and hidden ones they did not create', async () => {
    const list = await pendingFor(emails.maintainer);
    expect(titles(list.items)).toEqual(['Late for all', 'Soon for all']);
    expect(list.upcoming).toEqual([]);
  });

  it('gives a reader nothing to act on', async () => {
    expect(await pendingFor(emails.reader)).toEqual({ items: [], upcoming: [] });
  });

  it('stays within the member’s own decks', async () => {
    expect(titles((await pendingFor(emails.stranger)).items)).toEqual(['Elsewhere']);
    expect(titles((await pendingFor(emails.owner)).items)).not.toContain('Elsewhere');
  });

  it('drops a reminder once it is dismissed', async () => {
    const r = await createReminder(deck.slug, emails.editor, 'Dismiss me', {
      dueInHours: 1,
      showBeforeHours: 2,
    });
    expect(titles((await pendingFor(emails.owner)).items)).toContain('Dismiss me');
    const res = await request('POST', `/items/${r.id}/dismiss`, emails.owner, { done: false });
    expect(res.status).toBe(200);
    expect(titles((await pendingFor(emails.owner)).items)).not.toContain('Dismiss me');
  });

  it('needs a session', async () => {
    const res = await ctx.app.request('/me/pending');
    expect(res.status).toBe(401);
  });
});
