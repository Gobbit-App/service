import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import {
  eventMutes,
  notificationDeliveries,
  pushSubscriptions,
  type DeckRow,
  type UserRow,
} from '@gobbit/db';
import { addMember, createAccountUser, createDeck } from '@gobbit/db/test';
import type { PushMessage } from '@gobbit/shared';
import { buildNotifyService } from '../src/push/push-wiring';
import type { PushSender, PushTarget } from '../src/push/push-sender';
import { captureLogger, expectDecision } from './capture-logger';
import { json, setupApiTest } from './helpers';

const DAY_MS = 86_400_000;

function inDays(days: number): string {
  const d = new Date(Date.now() + days * DAY_MS);
  d.setUTCSeconds(0, 0);
  return d.toISOString();
}

/** A push service stand-in that records every send. */
function fakePush() {
  const sent: Array<{ target: PushTarget; message: PushMessage }> = [];
  const sender: PushSender = {
    async send(target, message) {
      sent.push({ target, message });
      return { kind: 'sent' };
    },
  };
  return { sender, sent };
}

/**
 * 042 US2 (T050, D360–D362): event notices reach the audience by push only, at most once per
 * notice, never after the start (grace), never for proposed, archived or deleted cards.
 */
describe('event notifications (042)', () => {
  const push = fakePush();
  const capture = captureLogger();
  const ctx = setupApiTest({ push: push.sender, logger: capture.logger });
  let deck: DeckRow;
  let editor: UserRow;
  let reader: UserRow;

  const notify = (opts: { push?: PushSender | null } = {}) =>
    buildNotifyService({
      db: ctx.t.db,
      env: ctx.env,
      mailer: ctx.mailer,
      push: opts.push === undefined ? push.sender : opts.push,
      logger: capture.logger,
    });

  const send = (method: string, path: string, email: string, body?: unknown) =>
    ctx.app.request(path, {
      method,
      headers: ctx.as(email),
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  beforeAll(async () => {
    editor = await createAccountUser(ctx.t.db);
    reader = await createAccountUser(ctx.t.db);
    await ctx.sessionFor(editor);
    await ctx.sessionFor(reader);
  });

  beforeEach(async () => {
    capture.lines.length = 0;
    push.sent.length = 0;
    ctx.mailer.sent.length = 0;
    await ctx.t.db.delete(pushSubscriptions);
    deck = await createDeck(ctx.t.db, ctx.world.owner, { kind: 'shared' });
    await addMember(ctx.t.db, deck, editor, 'editor');
    await addMember(ctx.t.db, deck, reader, 'reader');
  });

  async function subscribe(user: UserRow, endpoint: string): Promise<void> {
    const res = await send('POST', '/me/push-subscriptions', user.email, {
      endpoint,
      keys: { p256dh: 'BPk', auth: 'auth' },
    });
    expect(res.status).toBe(204);
  }

  async function createEvent(
    title: string,
    audience: { mode: string; userIds?: string[] } = { mode: 'everyone' },
    extra: Record<string, unknown> = {},
  ): Promise<{ id: string }> {
    const res = await send('POST', `/decks/${deck.id}/items`, editor.email, {
      type: 'event',
      title,
      payload: {
        allDay: false,
        start: inDays(3),
        timeZone: 'UTC',
        notify: { before: [{ amount: 1, unit: 'days' }], audience: { userIds: [], ...audience } },
      },
      ...extra,
    });
    expect(res.status).toBe(201);
    return (await json(res)) as { id: string };
  }

  /** Pending notices of `itemId` fire `minutesAgo` in the past (their start stays ahead). */
  async function makeDue(itemId: string, minutesAgo = 2): Promise<void> {
    await ctx.t.db.execute(sql`
      update event_notices set fire_at = date_trunc('milliseconds', now() - make_interval(mins => ${minutesAgo}))
       where item_id = ${itemId} and state = 'pending'
    `);
  }

  /** The event (and its pending notices) started `minutesAgo`; the notice fired an hour before. */
  async function makeStarted(itemId: string, minutesAgo: number): Promise<void> {
    await ctx.t.db.transaction(async (tx) => {
      await tx.execute(sql`
        update event_cards
           set starts_at = date_trunc('milliseconds', now() - make_interval(mins => ${minutesAgo})),
               ends_at = date_trunc('milliseconds', now() + interval '1 hour')
         where item_id = ${itemId}
      `);
      await tx.execute(sql`
        update event_notices n
           set starts_at = c.starts_at, fire_at = c.starts_at - interval '1 hour'
          from event_cards c
         where c.item_id = n.item_id and n.item_id = ${itemId} and n.state = 'pending'
      `);
    });
  }

  const pushedTo = (title: string) =>
    push.sent.filter((s) => s.message.title === title).map((s) => s.target.endpoint);

  const deliveries = (itemId: string) =>
    ctx.t.db.select().from(notificationDeliveries).where(eq(notificationDeliveries.itemId, itemId));

  async function noticeStates(itemId: string): Promise<string[]> {
    const res = await ctx.t.pool.query(
      `SELECT state, skip_reason FROM event_notices WHERE item_id = $1 ORDER BY fire_at`,
      [itemId],
    );
    return res.rows.map((r) => [r.state, r.skip_reason].filter(Boolean).join(':'));
  }

  it('pushes each audience device once, however many ticks run, and never emails', async () => {
    await subscribe(editor, 'https://fcm.googleapis.com/ed-1');
    await subscribe(reader, 'https://fcm.googleapis.com/rita-1');
    const e = await createEvent('Street fair');
    await makeDue(e.id);

    await notify().tick('job-1');
    await notify().tick('job-2');

    expect(pushedTo('Street fair').sort()).toEqual([
      'https://fcm.googleapis.com/ed-1',
      'https://fcm.googleapis.com/rita-1',
    ]);
    expect(push.sent[0]!.message.url).toBe(`/i/${e.id}`);
    expect(ctx.mailer.sent).toEqual([]);
    const rows = await deliveries(e.id);
    expect(rows.map((d) => `${d.kind}:${d.channel}:${d.status}`)).toEqual([
      'event:push:sent',
      'event:push:sent',
    ]);
    expect(await noticeStates(e.id)).toEqual(['planned']);
    await capture.flush();
    expectDecision(capture.lines, 'event.notice', { outcome: 'planned' });
    expectDecision(capture.lines, 'event.notice', { outcome: 'sent' });
    // The deck owner has no device.
    expectDecision(capture.lines, 'event.notice', { outcome: 'skipped', reason: 'no_channel' });
  });

  it('skips a notice found after the start plus grace', async () => {
    await subscribe(editor, 'https://fcm.googleapis.com/ed-late');
    const e = await createEvent('Late fair', { mode: 'me' });
    await makeStarted(e.id, ctx.env.EVENT_NOTICE_GRACE_MINUTES + 10);

    await notify().tick('job-3');

    expect(pushedTo('Late fair')).toEqual([]);
    expect(await deliveries(e.id)).toEqual([]);
    expect(await noticeStates(e.id)).toEqual(['skipped:started']);
    await capture.flush();
    expectDecision(capture.lines, 'event.notice', { outcome: 'skipped', reason: 'started' });
  });

  it('still sends a notice a little late, within the grace', async () => {
    await subscribe(editor, 'https://fcm.googleapis.com/ed-grace');
    const e = await createEvent('Grace fair', { mode: 'me' });
    await makeStarted(e.id, 1);

    await notify().tick('job-4');

    expect(pushedTo('Grace fair')).toEqual(['https://fcm.googleapis.com/ed-grace']);
  });

  it('sends nothing for proposed, archived or deleted events', async () => {
    await subscribe(editor, 'https://fcm.googleapis.com/ed-gone');
    const proposed = await createEvent('Proposed fair', { mode: 'me' }, { status: 'proposed' });
    const archived = await createEvent('Archived fair', { mode: 'me' });
    const deleted = await createEvent('Deleted fair', { mode: 'me' });
    for (const e of [proposed, archived, deleted]) await makeDue(e.id);
    expect((await send('POST', `/items/${archived.id}/archive`, editor.email)).status).toBe(200);
    const removed = await send('DELETE', `/items/${deleted.id}`, ctx.world.owner.email);
    expect(removed.status).toBeLessThan(300);

    await notify().tick('job-5');

    expect(push.sent).toEqual([]);
    for (const e of [proposed, archived, deleted]) expect(await deliveries(e.id)).toEqual([]);
  });

  it('drops a planned notice when the card is archived before the send', async () => {
    await subscribe(editor, 'https://fcm.googleapis.com/ed-drop');
    const e = await createEvent('Dropped fair', { mode: 'me' });
    await makeDue(e.id);
    await notify().planEvents('job-6');
    expect((await send('POST', `/items/${e.id}/archive`, editor.email)).status).toBe(200);
    await notify().deliver('job-6');

    expect(pushedTo('Dropped fair')).toEqual([]);
    expect((await deliveries(e.id)).map((d) => `${d.status}:${d.lastError}`)).toEqual([
      'failed:stale',
    ]);
    await capture.flush();
    expectDecision(capture.lines, 'event.notice', { outcome: 'dropped', reason: 'stale' });
  });

  it('notifies again after the start moves', async () => {
    await subscribe(editor, 'https://fcm.googleapis.com/ed-move');
    const e = await createEvent('Moved fair', { mode: 'me' });
    await makeDue(e.id);
    await notify().tick('job-7');
    expect(pushedTo('Moved fair')).toHaveLength(1);

    const item = (await json(await send('GET', `/items/${e.id}`, editor.email))) as {
      payload: Record<string, unknown>;
    };
    const moved = await send('PATCH', `/items/${e.id}`, editor.email, {
      payload: { ...item.payload, start: inDays(5) },
    });
    expect(moved.status).toBe(200);
    await makeDue(e.id);
    await notify().tick('job-8');

    expect(pushedTo('Moved fair')).toHaveLength(2);
    expect(await noticeStates(e.id)).toEqual(['planned', 'planned']);
  });

  it('only notifies people who can read the card, and not those who muted it', async () => {
    await subscribe(editor, 'https://fcm.googleapis.com/ed-pick');
    await subscribe(reader, 'https://fcm.googleapis.com/rita-pick');
    const leaver = await createAccountUser(ctx.t.db);
    await addMember(ctx.t.db, deck, leaver, 'reader');
    const e = await createEvent('Picked fair', {
      mode: 'people',
      userIds: [reader.id, editor.id, leaver.id],
    });
    const left = await send(
      'DELETE',
      `/decks/${deck.id}/members/${leaver.id}`,
      ctx.world.owner.email,
    );
    expect(left.status).toBe(204);
    await ctx.t.db.insert(eventMutes).values({ itemId: e.id, userId: editor.id, muted: true });
    await makeDue(e.id);

    await notify().tick('job-9');

    expect(pushedTo('Picked fair')).toEqual(['https://fcm.googleapis.com/rita-pick']);
    await capture.flush();
    expect(
      expectDecision(capture.lines, 'event.notice', { outcome: 'skipped', reason: 'ineligible' })
        .userId,
    ).toBe(leaver.id);
    expect(
      expectDecision(capture.lines, 'event.notice', { outcome: 'skipped', reason: 'muted' }).userId,
    ).toBe(editor.id);
  });

  it('plans nothing without VAPID and records push_off', async () => {
    await subscribe(editor, 'https://fcm.googleapis.com/ed-off');
    const e = await createEvent('Quiet fair', { mode: 'me' });
    await makeDue(e.id);

    await notify({ push: null }).tick('job-10');

    expect(await deliveries(e.id)).toEqual([]);
    expect(await noticeStates(e.id)).toEqual(['planned']);
    await capture.flush();
    expectDecision(capture.lines, 'event.notice', { outcome: 'skipped', reason: 'push_off' });
  });
});
