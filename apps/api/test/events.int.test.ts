import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DeckRow, UserRow } from '@gobbit/db';
import { addMember, createAccountUser, createDeck } from '@gobbit/db/test';
import { eventSpan } from '@gobbit/shared/event-constants';
import { captureLogger, expectDecision } from './capture-logger';
import { json, setupApiTest } from './helpers';

const DAY_MS = 86_400_000;
const NOTIFY_DEFAULT = {
  before: [{ amount: 1, unit: 'days' }],
  audience: { mode: 'everyone', userIds: [] as string[] },
};

/** ISO instant `days` from now, on a whole minute, in UTC. */
function inDays(days: number): string {
  const d = new Date(Date.now() + days * DAY_MS);
  d.setUTCSeconds(0, 0);
  return d.toISOString();
}

function timed(over: Record<string, unknown> = {}) {
  return { allDay: false, start: inDays(10), timeZone: 'UTC', notify: NOTIFY_DEFAULT, ...over };
}

/** 042 US1 (T020): event cards through the member API. */
describe('event cards (042)', () => {
  const capture = captureLogger();
  const ctx = setupApiTest({ env: { EVENT_LOCATION_MAX: '50' }, logger: capture.logger });
  let creator: UserRow;
  let outsider: UserRow;
  let deck: DeckRow;

  beforeAll(async () => {
    creator = await createAccountUser(ctx.t.db);
    outsider = await createAccountUser(ctx.t.db);
    await ctx.sessionFor(creator);
    await ctx.sessionFor(outsider);
  });

  beforeEach(async () => {
    capture.lines.length = 0;
    deck = await createDeck(ctx.t.db, ctx.world.owner);
    await addMember(ctx.t.db, deck, creator, 'editor');
  });

  const send = (method: string, path: string, body?: unknown, email?: string) =>
    ctx.app.request(path, {
      method,
      headers: ctx.as(email),
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  const create = (payload: unknown, extra: Record<string, unknown> = {}, email = creator.email) =>
    send(
      'POST',
      `/decks/${deck.id}/items`,
      { type: 'event', title: 'Street fair', payload, ...extra },
      email,
    );

  async function created(payload: unknown, extra: Record<string, unknown> = {}) {
    const res = await create(payload, extra);
    expect(res.status).toBe(201);
    return json(res);
  }

  async function notices(itemId: string) {
    const res = await ctx.t.pool.query(
      `SELECT before_amount, before_unit, state, skip_reason FROM event_notices
       WHERE item_id = $1 ORDER BY fire_at`,
      [itemId],
    );
    return res.rows as {
      before_amount: number;
      before_unit: string;
      state: string;
      skip_reason: string | null;
    }[];
  }

  describe('create and read', () => {
    it('stores the event, derives the span and plans its notice', async () => {
      const payload = timed({ location: 'Town Hall' });
      const item = await created(payload);
      const span = eventSpan(payload as never);
      expect(item.event).toMatchObject({
        startsAt: span.startsAt.toISOString(),
        endsAt: span.endsAt.toISOString(),
        allDay: false,
        timeZone: 'UTC',
        inAudience: true,
        canEditNotify: true,
        muted: false,
      });
      expect(item.event.notices).toEqual([
        expect.objectContaining({ amount: 1, unit: 'days', state: 'pending' }),
      ]);
      expect(await notices(item.id)).toEqual([
        { before_amount: 1, before_unit: 'days', state: 'pending', skip_reason: null },
      ]);

      const read = await json(await send('GET', `/items/${item.id}`));
      expect(read.event.startsAt).toBe(span.startsAt.toISOString());
    });

    it('accepts a past start and skips its notices (past_at_save)', async () => {
      const item = await created(timed({ start: inDays(-3) }));
      expect(await notices(item.id)).toEqual([
        { before_amount: 1, before_unit: 'days', state: 'skipped', skip_reason: 'past_at_save' },
      ]);
    });

    it('an all-day event spans whole days in its zone', async () => {
      const item = await created({
        allDay: true,
        start: '2030-03-30',
        end: '2030-03-31',
        timeZone: 'Europe/London',
        notify: NOTIFY_DEFAULT,
      });
      expect(item.event).toMatchObject({
        startsAt: '2030-03-30T00:00:00.000Z',
        endsAt: '2030-03-31T23:00:00.000Z',
        allDay: true,
      });
    });

    it('a proposal keeps its notices in sync; delivery waits for publish (stale skip)', async () => {
      const item = await created(timed(), { status: 'proposed' });
      expect((await notices(item.id)).map((n) => n.state)).toEqual(['pending']);
      const res = await send('POST', `/items/${item.id}/publish`, {});
      expect(res.status).toBe(200);
      expect((await notices(item.id)).map((n) => n.state)).toEqual(['pending']);
    });
  });

  describe('validation', () => {
    it('refuses an end before the start (400)', async () => {
      const start = inDays(10);
      const res = await create(timed({ start, end: inDays(9) }));
      expect(res.status).toBe(400);
    });

    it.each([
      ['a start more than five years away', { start: inDays(6 * 365) }, 'payload.start'],
      ['a location over EVENT_LOCATION_MAX', { location: 'x'.repeat(51) }, 'payload.location'],
    ])('422 for %s', async (_name, over, path) => {
      const res = await create(timed(over));
      expect(res.status).toBe(422);
      const body = await json(res);
      expect(body.type).toBe('/problems/validation');
      expect(body.errors).toEqual([expect.objectContaining({ path })]);
    });

    it('422 event-audience-unknown-member for people outside the deck', async () => {
      const res = await create(
        timed({
          notify: { ...NOTIFY_DEFAULT, audience: { mode: 'people', userIds: [outsider.id] } },
        }),
      );
      expect(res.status).toBe(422);
      expect((await json(res)).type).toBe('/problems/event-audience-unknown-member');
    });

    it('accepts chosen people who are members', async () => {
      const item = await created(
        timed({
          notify: { ...NOTIFY_DEFAULT, audience: { mode: 'people', userIds: [creator.id] } },
        }),
      );
      expect(item.payload.notify.audience).toEqual({ mode: 'people', userIds: [creator.id] });
    });

    it('409 type-change-not-supported, to and from an event', async () => {
      const item = await created(timed());
      const toText = await send('PATCH', `/items/${item.id}`, { type: 'text' });
      expect(toText.status).toBe(409);
      expect((await json(toText)).type).toBe('/problems/type-change-not-supported');

      const text = await json(
        await send('POST', `/decks/${deck.id}/items`, { type: 'text', title: 'Note' }),
      );
      const toEvent = await send('PATCH', `/items/${text.id}`, { type: 'event' });
      expect(toEvent.status).toBe(409);
    });
  });

  describe('edits', () => {
    it('moving the start replaces pending notices', async () => {
      const item = await created(timed());
      const moved = timed({ start: inDays(20) });
      const res = await send('PATCH', `/items/${item.id}`, { payload: moved }, creator.email);
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.event.startsAt).toBe(new Date(moved.start as string).toISOString());
      const rows = await ctx.t.pool.query(
        `SELECT starts_at FROM event_notices WHERE item_id = $1`,
        [item.id],
      );
      expect(rows.rows.map((r) => (r.starts_at as Date).toISOString())).toEqual([
        new Date(moved.start as string).toISOString(),
      ]);
    });

    it('D363: only the creator changes notify settings while they are a member', async () => {
      const item = await created(timed());
      const notify = { ...NOTIFY_DEFAULT, before: [{ amount: 2, unit: 'hours' }] };

      const locked = await send('PATCH', `/items/${item.id}`, {
        payload: { ...item.payload, notify },
      });
      expect(locked.status).toBe(409);
      expect((await json(locked)).type).toBe('/problems/event-notify-locked');

      const ownerView = await json(await send('GET', `/items/${item.id}`));
      expect(ownerView.event.canEditNotify).toBe(false);

      const otherFields = await send('PATCH', `/items/${item.id}`, {
        payload: { ...item.payload, location: 'Park' },
      });
      expect(otherFields.status).toBe(200);

      const mine = await send(
        'PATCH',
        `/items/${item.id}`,
        { payload: { ...item.payload, location: 'Park', notify } },
        creator.email,
      );
      expect(mine.status).toBe(200);
      expect((await notices(item.id)).map((n) => [n.before_amount, n.before_unit])).toEqual([
        [2, 'hours'],
      ]);
    });

    it('D363: an owner may change notify settings once the creator left the deck', async () => {
      const item = await created(timed());
      const left = await send('DELETE', `/decks/${deck.id}/members/${creator.id}`);
      expect(left.status).toBe(204);
      expect((await json(await send('GET', `/items/${item.id}`))).event.canEditNotify).toBe(true);

      const notify = { ...NOTIFY_DEFAULT, before: [{ amount: 3, unit: 'hours' }] };
      const res = await send('PATCH', `/items/${item.id}`, {
        payload: { ...item.payload, notify },
      });
      expect(res.status).toBe(200);
      await capture.flush();
      expectDecision(capture.lines, 'event.notify_settings', { outcome: 'changed' });
    });

    it('the activity log names event sub-fields, never payload', async () => {
      const item = await created(timed());
      await send('PATCH', `/items/${item.id}`, { payload: { ...item.payload, location: 'Park' } });
      const res = await send('GET', `/decks/${deck.id}/events`);
      expect(res.status).toBe(200);
      const updated = (await json(res)).data.find(
        (l: { kind: string; itemId: string }) => l.kind === 'updated' && l.itemId === item.id,
      );
      expect(updated.changes).toEqual(['location']);
    });
  });

  describe('mute (D364)', () => {
    const mute = (id: string, method: 'PUT' | 'DELETE', email?: string) =>
      send(method, `/items/${id}/mute`, undefined, email);
    const view = async (id: string, email?: string) =>
      (await json(await send('GET', `/items/${id}`, undefined, email))).event;

    it('mutes and unmutes for the caller only, idempotently', async () => {
      const item = await created(timed());
      expect((await mute(item.id, 'PUT')).status).toBe(204);
      expect((await mute(item.id, 'PUT')).status).toBe(204);
      expect((await view(item.id)).muted).toBe(true);
      // Private to the person who muted.
      expect((await view(item.id, creator.email)).muted).toBe(false);

      expect((await mute(item.id, 'DELETE')).status).toBe(204);
      expect((await mute(item.id, 'DELETE')).status).toBe(204);
      expect((await view(item.id)).muted).toBe(false);
      await capture.flush();
      expectDecision(capture.lines, 'event.mute', { outcome: 'muted', itemId: item.id });
      expectDecision(capture.lines, 'event.mute', { outcome: 'unmuted', itemId: item.id });
    });

    it('409 not-an-event for other card types', async () => {
      const res = await send('POST', `/decks/${deck.id}/items`, {
        type: 'text',
        title: 'Note',
        body: 'Hello',
      });
      expect(res.status).toBe(201);
      const note = await json(res);
      const refused = await mute(note.id, 'PUT');
      expect(refused.status).toBe(409);
      expect((await json(refused)).type).toBe('/problems/not-an-event');
      await capture.flush();
      expectDecision(capture.lines, 'event.mute', { outcome: 'refused', reason: 'not_an_event' });
    });

    it('409 event-not-in-audience on PUT; DELETE still succeeds', async () => {
      const item = await created(
        timed({ notify: { ...NOTIFY_DEFAULT, audience: { mode: 'me', userIds: [] } } }),
      );
      const refused = await mute(item.id, 'PUT');
      expect(refused.status).toBe(409);
      expect((await json(refused)).type).toBe('/problems/event-not-in-audience');
      expect((await mute(item.id, 'DELETE')).status).toBe(204);
      await capture.flush();
      expectDecision(capture.lines, 'event.mute', {
        outcome: 'refused',
        reason: 'not_in_audience',
      });
    });

    it('404 for someone who cannot read the card', async () => {
      const item = await created(timed());
      expect((await mute(item.id, 'PUT', outsider.email)).status).toBe(404);
      expect((await mute(item.id, 'DELETE', outsider.email)).status).toBe(404);
    });
  });

  it('a personal deck stores audience "me" whatever was sent', async () => {
    const solo = await createAccountUser(ctx.t.db);
    await ctx.sessionFor(solo);
    const personal = await createDeck(ctx.t.db, solo, { isDefault: true });
    const res = await send(
      'POST',
      `/decks/${personal.id}/items`,
      { type: 'event', title: 'Dentist', payload: timed() },
      solo.email,
    );
    expect(res.status).toBe(201);
    expect((await json(res)).payload.notify.audience).toEqual({ mode: 'me', userIds: [] });
  });
});
