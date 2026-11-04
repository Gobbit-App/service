import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import {
  memberships,
  notificationDeliveries,
  pushSubscriptions,
  reminders,
  type DeckRow,
} from '@gobbit/db';
import { addMember, createAccountUser, createDeck } from '@gobbit/db/test';
import { itemSchema, type Item, type PushMessage } from '@gobbit/shared';
import { buildNotifyService } from '../src/push/push-wiring';
import type { PushOutcome, PushSender, PushTarget } from '../src/push/push-sender';
import { captureLogger, expectDecision } from './capture-logger';
import { json, setupApiTest } from './helpers';

const DAY_MS = 86_400_000;
type Role = 'owner' | 'maintainer' | 'editor' | 'reader';

/** A push service stand-in: records sends, answers per endpoint (default 201). */
function fakePush() {
  const sent: Array<{ target: PushTarget; message: PushMessage }> = [];
  const answers = new Map<string, PushOutcome>();
  const sender: PushSender = {
    async send(target, message) {
      sent.push({ target, message });
      return answers.get(target.endpoint) ?? { kind: 'sent' };
    },
  };
  return { sender, sent, answers };
}

/**
 * 037 notifications (T022–T024, D295–D297): who gets told, on which channel, and at most once —
 * across ticks, crashes mid-send and deadline changes.
 */
describe('reminder notifications (037)', () => {
  const push = fakePush();
  const capture = captureLogger();
  const ctx = setupApiTest({ push: push.sender, logger: capture.logger });
  let deck: DeckRow;
  const emails = {} as Record<Role, string>;
  const ids = {} as Record<Role, string>;

  const notify = () =>
    buildNotifyService({
      db: ctx.t.db,
      env: ctx.env,
      mailer: ctx.mailer,
      push: push.sender,
      logger: capture.logger,
    });

  beforeAll(async () => {
    deck = await createDeck(ctx.t.db, ctx.world.owner, { slug: 'notify', kind: 'shared' });
    emails.owner = ctx.world.owner.email;
    ids.owner = ctx.world.owner.id;
    for (const role of ['maintainer', 'editor', 'reader'] as const) {
      const user = await createAccountUser(ctx.t.db, { email: `${role}-notify@example.test` });
      await addMember(ctx.t.db, deck, user, role);
      await ctx.sessionFor(user);
      emails[role] = user.email;
      ids[role] = user.id;
    }
  });

  beforeEach(() => {
    capture.lines.length = 0;
    push.sent.length = 0;
  });

  const request = (method: string, path: string, role: Role, body?: unknown) =>
    ctx.app.request(path, {
      method,
      headers: ctx.as(emails[role]),
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  async function createReminder(
    title: string,
    dismiss: { mode: 'me' | 'writers' | 'people'; userIds?: string[] } = { mode: 'writers' },
  ): Promise<Item> {
    const res = await request('POST', `/decks/${deck.slug}/items`, 'editor', {
      type: 'reminder',
      title,
      payload: {
        deadline: new Date(Date.now() + DAY_MS).toISOString(),
        showBefore: { amount: 1, unit: 'hours' },
        dismiss: { userIds: [], ...dismiss },
        timeZone: 'Europe/London',
      },
    });
    expect(res.status).toBe(201);
    return itemSchema.parse(await json(res));
  }

  /** Moves the server-owned deadline (and the payload's copy) `minutesAgo` into the past. */
  async function makeDue(itemId: string, minutesAgo = 5): Promise<void> {
    await ctx.t.db.execute(sql`
      with d as (select now() - make_interval(mins => ${minutesAgo}) as at)
      update items
         set payload = jsonb_set(payload, '{deadline}', to_jsonb(to_char((select at from d) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))
       where id = ${itemId}
    `);
    await ctx.t.db.execute(sql`
      update reminders set deadline = date_trunc('milliseconds', now() - make_interval(mins => ${minutesAgo}))
       where item_id = ${itemId}
    `);
  }

  const mailsFor = (title: string) =>
    ctx.mailer.sent.filter((m) => m.subject === `Reminder: ${title}`).map((m) => m.to);

  const deliveries = (itemId: string) =>
    ctx.t.db.select().from(notificationDeliveries).where(eq(notificationDeliveries.itemId, itemId));

  async function subscribe(role: Role, endpoint: string): Promise<void> {
    const res = await request('POST', '/me/push-subscriptions', role, {
      endpoint,
      keys: { p256dh: 'BPk', auth: 'auth' },
    });
    expect(res.status).toBe(204);
  }

  it('emails each writer once, never a reader, however many ticks run', async () => {
    const r = await createReminder('Pay the zebra tax');
    await makeDue(r.id);

    await notify().tick('job-1');
    await notify().tick('job-2');

    expect(mailsFor('Pay the zebra tax').sort()).toEqual(
      [emails.owner, emails.maintainer, emails.editor].sort(),
    );
    const rows = await deliveries(r.id);
    expect(rows).toHaveLength(3);
    expect(rows.every((d) => d.status === 'sent' && d.attempts === 1)).toBe(true);
    await capture.flush();
    expectDecision(capture.lines, 'reminder.notify', { outcome: 'planned' });
    expectDecision(capture.lines, 'reminder.notify', { outcome: 'sent' });
  });

  it('skips the email for someone who turned reminder emails off', async () => {
    const off = await request('PUT', '/me/notification-preferences', 'maintainer', {
      reminderEmails: false,
    });
    expect(await json(off)).toEqual({ reminderEmails: false });
    try {
      const r = await createReminder('Feed the opted-out zebra');
      await makeDue(r.id);
      await notify().tick('job-3');

      expect(mailsFor('Feed the opted-out zebra')).not.toContain(emails.maintainer);
      expect(mailsFor('Feed the opted-out zebra')).toContain(emails.editor);
      await capture.flush();
      expect(
        capture.lines.some(
          (l) =>
            l.event === 'reminder.notify' &&
            l.outcome === 'skipped' &&
            l.reason === 'opted_out' &&
            l.userId === ids.maintainer,
        ),
      ).toBe(true);
    } finally {
      await request('PUT', '/me/notification-preferences', 'maintainer', { reminderEmails: true });
    }
  });

  it('pushes to each device and forgets one the push service says is gone (410)', async () => {
    const live = 'https://fcm.googleapis.com/fcm/send/editor-live';
    const dead = 'https://fcm.googleapis.com/fcm/send/editor-dead';
    await subscribe('editor', live);
    await subscribe('editor', dead);
    push.answers.set(dead, { kind: 'gone', code: 'http_410' });

    const r = await createReminder('Walk the push zebra', { mode: 'me' });
    await makeDue(r.id);
    await notify().tick('job-4');

    const endpoints = push.sent.map((s) => s.target.endpoint).sort();
    expect(endpoints).toEqual([dead, live].sort());
    expect(push.sent[0]!.message).toMatchObject({
      title: 'Walk the push zebra',
      url: `/i/${r.id}`,
    });
    const left = await ctx.t.db
      .select({ endpoint: pushSubscriptions.endpoint })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, ids.editor));
    expect(left.map((s) => s.endpoint)).toEqual([live]);
    const statuses = (await deliveries(r.id)).map((d) => `${d.channel}:${d.status}`).sort();
    expect(statuses).toEqual(['email:sent', 'push:gone', 'push:sent']);

    await request('DELETE', '/me/push-subscriptions', 'editor', { endpoint: live });
  });

  it('skips a picked person who can no longer mark it done', async () => {
    const r = await createReminder('Ask the maintainer zebra', {
      mode: 'people',
      userIds: [ids.maintainer],
    });
    await ctx.t.db
      .update(memberships)
      .set({ role: 'reader' })
      .where(and(eq(memberships.deckId, deck.id), eq(memberships.userId, ids.maintainer)));
    try {
      await makeDue(r.id);
      await notify().tick('job-5');
      expect(mailsFor('Ask the maintainer zebra')).not.toContain(emails.maintainer);
      await capture.flush();
      expectDecision(capture.lines, 'reminder.notify', {
        outcome: 'skipped',
        reason: 'ineligible',
      });
    } finally {
      await ctx.t.db
        .update(memberships)
        .set({ role: 'maintainer' })
        .where(and(eq(memberships.deckId, deck.id), eq(memberships.userId, ids.maintainer)));
    }
  });

  it('notifies again for a new deadline, once', async () => {
    const r = await createReminder('Moved zebra', { mode: 'me' });
    await makeDue(r.id, 30);
    await notify().tick('job-6');
    expect(mailsFor('Moved zebra')).toEqual([emails.editor]);

    await makeDue(r.id, 2);
    await notify().tick('job-7');
    await notify().tick('job-8');
    expect(mailsFor('Moved zebra')).toEqual([emails.editor, emails.editor]);
    const [row] = await ctx.t.db
      .select({ notified: reminders.notifiedDeadline, deadline: reminders.deadline })
      .from(reminders)
      .where(eq(reminders.itemId, r.id));
    expect(row!.notified!.getTime()).toBe(row!.deadline.getTime());
  });

  it('drops a planned message when the reminder is done before it goes out', async () => {
    const r = await createReminder('Already done zebra', { mode: 'me' });
    await makeDue(r.id);
    await notify().plan('job-9');
    const done = await request('POST', `/items/${r.id}/dismiss`, 'editor', { done: true });
    expect(done.status).toBe(200);
    await notify().deliver('job-9');

    expect(mailsFor('Already done zebra')).toEqual([]);
    expect((await deliveries(r.id)).map((d) => `${d.status}:${d.lastError}`)).toEqual([
      'failed:stale',
    ]);
    await capture.flush();
    expectDecision(capture.lines, 'reminder.notify', { outcome: 'dropped', reason: 'stale' });
  });

  it('never resends a message cut off mid-send (crash between claim and send)', async () => {
    const r = await createReminder('Crashed zebra', { mode: 'me' });
    await makeDue(r.id);
    await notify().plan('job-10');
    // A worker claimed it and died before finishing (bypass the auto-timestamp trigger to age it).
    await ctx.t.db.transaction(async (tx) => {
      await tx.execute(
        sql`alter table notification_deliveries disable trigger notification_deliveries_set_updated_at`,
      );
      await tx.execute(sql`
        update notification_deliveries
           set status = 'sending', attempts = 1, updated_at = now() - interval '11 minutes'
         where item_id = ${r.id}
      `);
      await tx.execute(
        sql`alter table notification_deliveries enable trigger notification_deliveries_set_updated_at`,
      );
    });
    await notify().tick('job-11');
    await notify().tick('job-12');

    expect(mailsFor('Crashed zebra')).toEqual([]);
    expect((await deliveries(r.id)).map((d) => d.status)).toEqual(['interrupted']);
    await capture.flush();
    expectDecision(capture.lines, 'reminder.notify', { outcome: 'interrupted' });
  });

  it('runs two sweeps at once without planning or sending twice', async () => {
    const r = await createReminder('Racing zebra');
    await makeDue(r.id);
    await Promise.all([notify().tick('job-13'), notify().tick('job-14')]);
    expect(mailsFor('Racing zebra').sort()).toEqual(
      [emails.owner, emails.maintainer, emails.editor].sort(),
    );
  });
});

describe('push subscription routes (037, D297)', () => {
  const push = fakePush();
  const ctx = setupApiTest({ push: push.sender });

  it('refuses an endpoint outside the push services (400 problem)', async () => {
    const res = await ctx.app.request('/me/push-subscriptions', {
      method: 'POST',
      headers: ctx.as(),
      body: JSON.stringify({
        endpoint: 'https://evil.example/push',
        keys: { p256dh: 'BPk', auth: 'auth' },
      }),
    });
    expect(res.status).toBe(400);
    expect((await json(res)).type).toBe('/problems/push-host-not-allowed');
  });

  it('re-adding a device keeps one row; the test reaches it; removing is idempotent', async () => {
    const endpoint = 'https://web.push.apple.com/device-1';
    const add = () =>
      ctx.app.request('/me/push-subscriptions', {
        method: 'POST',
        headers: ctx.as(),
        body: JSON.stringify({ endpoint, keys: { p256dh: 'BPk', auth: 'auth' }, label: 'iPhone' }),
      });
    expect((await add()).status).toBe(204);
    expect((await add()).status).toBe(204);
    const rows = await ctx.t.db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, endpoint));
    expect(rows).toHaveLength(1);

    const test = await ctx.app.request('/me/push-subscriptions/test', {
      method: 'POST',
      headers: ctx.as(),
    });
    expect(test.status).toBe(202);
    expect(await json(test)).toEqual({ devices: 1 });
    expect(push.sent.at(-1)!.message.tag).toBe('gobbit-test');

    for (let i = 0; i < 2; i++) {
      const del = await ctx.app.request('/me/push-subscriptions', {
        method: 'DELETE',
        headers: ctx.as(),
        body: JSON.stringify({ endpoint }),
      });
      expect(del.status).toBe(204);
    }
  });

  it('needs a session', async () => {
    const res = await ctx.app.request('/me/notification-preferences', { headers: ctx.anon() });
    expect(res.status).toBe(401);
  });
});

describe('push off (no VAPID env)', () => {
  const ctx = setupApiTest({ push: null });

  it('answers 404 on push routes but keeps the email switch', async () => {
    const res = await ctx.app.request('/me/push-subscriptions/test', {
      method: 'POST',
      headers: ctx.as(),
    });
    expect(res.status).toBe(404);
    const prefs = await ctx.app.request('/me/notification-preferences', { headers: ctx.as() });
    expect(await json(prefs)).toEqual({ reminderEmails: true });
  });
});
