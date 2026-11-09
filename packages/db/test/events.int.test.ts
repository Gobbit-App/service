import { describe, it, expect } from 'vitest';
import { eventSpan } from '@gobbit/shared/event-constants';
import { withTestDb } from './db-fixture';

/** D356/D358/D365/D372: the event card's DB side (042). */
describe('event cards (D358)', () => {
  const t = withTestDb();

  const timed = {
    allDay: false,
    start: '2030-06-01T18:00:00+03:00',
    timeZone: 'Asia/Jerusalem',
    notify: { before: [{ amount: 1, unit: 'days' }], audience: { mode: 'everyone', userIds: [] } },
  };

  async function mkDeck(): Promise<string> {
    const account = await t.pool.query(`INSERT INTO accounts (name) VALUES ('T') RETURNING id`);
    const deck = await t.pool.query(
      `INSERT INTO decks (kind, slug, name, owner_account_id, is_public)
       VALUES ('shared', $1, 'D', $2, false) RETURNING id`,
      [`ev-${crypto.randomUUID().slice(0, 8)}`, account.rows[0].id],
    );
    return deck.rows[0].id;
  }

  async function insertEvent(deckId: string, payload: object, title = 'Fair'): Promise<string> {
    const res = await t.pool.query(
      `INSERT INTO items (deck_id, type, status, title, payload)
       VALUES ($1, 'event', 'proposed', $3, $2::jsonb) RETURNING id`,
      [deckId, JSON.stringify(payload), title],
    );
    return res.rows[0].id;
  }

  async function span(id: string) {
    const res = await t.pool.query(`SELECT * FROM event_cards WHERE item_id = $1`, [id]);
    return res.rows[0] as
      | { deck_id: string; all_day: boolean; starts_at: Date; ends_at: Date; time_zone: string }
      | undefined;
  }

  it.each([
    ['timed without end', { ...timed }],
    ['timed with end', { ...timed, end: '2030-06-01T21:30:00+03:00' }],
    ['all-day one day', { ...timed, allDay: true, start: '2030-06-01', notify: undefined }],
    [
      'all-day across spring-forward',
      { allDay: true, start: '2030-03-30', end: '2030-03-31', timeZone: 'Europe/London' },
    ],
    [
      'all-day across fall-back',
      { allDay: true, start: '2030-10-27', timeZone: 'America/New_York' },
    ],
    [
      'all-day at a midnight DST gap',
      { allDay: true, start: '2030-10-06', timeZone: 'America/Santiago' },
    ],
  ])('matches eventSpan() for %s', async (_name, p) => {
    const payload = {
      ...p,
      notify: { before: [], audience: { mode: 'everyone', userIds: [] } },
    } as Parameters<typeof eventSpan>[0] & object;
    const deckId = await mkDeck();
    const id = await insertEvent(deckId, payload);
    const row = await span(id);
    const expected = eventSpan(payload);
    expect(row?.starts_at.toISOString()).toBe(expected.startsAt.toISOString());
    expect(row?.ends_at.toISOString()).toBe(expected.endsAt.toISOString());
    expect(row?.all_day).toBe(payload.allDay);
    expect(row?.deck_id).toBe(deckId);
  });

  it('follows payload edits and deck moves', async () => {
    const deckId = await mkDeck();
    const other = await mkDeck();
    const id = await insertEvent(deckId, timed);
    await t.pool.query(`UPDATE items SET payload = $2::jsonb, deck_id = $3 WHERE id = $1`, [
      id,
      JSON.stringify({ ...timed, start: '2030-07-01T09:00:00Z' }),
      other,
    ]);
    const row = await span(id);
    expect(row?.starts_at.toISOString()).toBe('2030-07-01T09:00:00.000Z');
    expect(row?.ends_at.toISOString()).toBe('2030-07-01T10:00:00.000Z');
    expect(row?.deck_id).toBe(other);
  });

  it('refuses an end that is not after the start', async () => {
    const deckId = await mkDeck();
    await expect(
      insertEvent(deckId, { ...timed, end: '2030-06-01T18:00:00+03:00' }),
    ).rejects.toMatchObject({ constraint: 'event_cards_span_chk' });
  });

  it.each([
    ['allDay not boolean', { ...timed, allDay: 'no' }],
    ['no start', { ...timed, start: undefined }],
    ['no time zone', { ...timed, timeZone: undefined }],
    ['long location', { ...timed, location: 'x'.repeat(201) }],
    ['no notify', { ...timed, notify: undefined }],
    [
      'four notify times',
      {
        ...timed,
        notify: {
          before: [1, 2, 3, 4].map((amount) => ({ amount, unit: 'days' })),
          audience: { mode: 'everyone', userIds: [] },
        },
      },
    ],
  ])('items_event_payload_chk refuses %s', async (_name, payload) => {
    const deckId = await mkDeck();
    await expect(insertEvent(deckId, payload)).rejects.toMatchObject({
      constraint: 'items_event_payload_chk',
    });
  });

  it('searches location and preview text, not time, zone or notify', async () => {
    const deckId = await mkDeck();
    const id = await insertEvent(deckId, {
      ...timed,
      location: 'Town Hall',
      url: 'https://example.com/fair',
      preview: { title: 'Summer fair', description: 'Stalls', publicId: 'gobbit/x/secretid' },
    });
    const res = await t.pool.query(`SELECT search_text FROM items WHERE id = $1`, [id]);
    const text = res.rows[0].search_text as string;
    expect(text).toContain('town hall');
    expect(text).toContain('summer fair');
    expect(text).toContain('stalls');
    expect(text).not.toContain('jerusalem');
    expect(text).not.toContain('everyone');
    expect(text).not.toContain('secretid');
  });

  it('keeps notices unique per start and moment, and their state consistent', async () => {
    const deckId = await mkDeck();
    const id = await insertEvent(deckId, timed);
    const insert = (state: string, skip: string | null, planned: string | null) =>
      t.pool.query(
        `INSERT INTO event_notices (item_id, starts_at, before_amount, before_unit, fire_at, state, skip_reason, planned_at)
         VALUES ($1, '2030-06-01T15:00:00Z', 1, 'days', '2030-05-31T15:00:00Z', $2, $3, $4)`,
        [id, state, skip, planned],
      );
    await insert('pending', null, null);
    await expect(insert('pending', null, null)).rejects.toMatchObject({
      constraint: 'event_notices_once_uq',
    });
    await t.pool.query(`DELETE FROM event_notices WHERE item_id = $1`, [id]);
    await expect(insert('skipped', null, null)).rejects.toMatchObject({
      constraint: 'event_notices_skipped_chk',
    });
    await expect(insert('planned', null, null)).rejects.toMatchObject({
      constraint: 'event_notices_planned_chk',
    });
    await expect(insert('skipped', 'muted', null)).rejects.toMatchObject({
      constraint: 'event_notices_skip_reason_chk',
    });
  });

  it('ties event deliveries to a notice (D361)', async () => {
    const deckId = await mkDeck();
    const id = await insertEvent(deckId, timed);
    const user = await t.pool.query(
      `INSERT INTO users (account_id, email, display_name)
       SELECT owner_account_id, $2, 'U' FROM decks WHERE id = $1 RETURNING id`,
      [deckId, `ev-${crypto.randomUUID().slice(0, 8)}@example.com`],
    );
    await expect(
      t.pool.query(
        `INSERT INTO notification_deliveries (item_id, kind, deadline, user_id, channel, target)
         VALUES ($1, 'event', now(), $2, 'push', 'sub')`,
        [id, user.rows[0].id],
      ),
    ).rejects.toMatchObject({ constraint: 'notification_deliveries_kind_chk' });
  });

  it('drops the card row with the item', async () => {
    const deckId = await mkDeck();
    const id = await insertEvent(deckId, timed);
    await t.pool.query(`DELETE FROM items WHERE id = $1`, [id]);
    expect(await span(id)).toBeUndefined();
  });
});
