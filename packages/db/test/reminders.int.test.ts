import { describe, it, expect } from 'vitest';
import { withTestDb } from './db-fixture';

/** D291: items.reveal_at and the reminders row follow a reminder's payload (037). */
describe('reminder triggers (D291)', () => {
  const t = withTestDb();

  const deadline = '2030-06-01T12:00:00.000Z';
  const payload = (over: Record<string, unknown> = {}) =>
    JSON.stringify({
      deadline,
      showBefore: { amount: 2, unit: 'days' },
      dismiss: { mode: 'me', userIds: [] },
      timeZone: 'UTC',
      ...over,
    });

  async function mkDeck(): Promise<string> {
    const account = await t.pool.query(`INSERT INTO accounts (name) VALUES ('T') RETURNING id`);
    const deck = await t.pool.query(
      `INSERT INTO decks (kind, slug, name, owner_account_id, is_public)
       VALUES ('shared', $1, 'D', $2, false) RETURNING id`,
      [`rm-${crypto.randomUUID().slice(0, 8)}`, account.rows[0].id],
    );
    return deck.rows[0].id;
  }

  async function insertReminder(deckId: string, p = payload()): Promise<string> {
    const res = await t.pool.query(
      `INSERT INTO items (deck_id, type, status, title, payload)
       VALUES ($1, 'reminder', 'proposed', 'Pay rent', $2::jsonb) RETURNING id`,
      [deckId, p],
    );
    return res.rows[0].id;
  }

  async function revealAt(id: string): Promise<Date | null> {
    const res = await t.pool.query(`SELECT reveal_at FROM items WHERE id = $1`, [id]);
    return res.rows[0].reveal_at;
  }

  it('derives reveal_at and creates the reminders row on insert', async () => {
    const deckId = await mkDeck();
    const id = await insertReminder(deckId);
    expect((await revealAt(id))?.toISOString()).toBe('2030-05-30T12:00:00.000Z');
    const row = await t.pool.query(`SELECT * FROM reminders WHERE item_id = $1`, [id]);
    expect(row.rows).toHaveLength(1);
    expect(row.rows[0].deck_id).toBe(deckId);
    expect(row.rows[0].deadline.toISOString()).toBe(deadline);
    expect(row.rows[0].outcome).toBe('pending');
  });

  it('follows payload edits and keeps the outcome', async () => {
    const deckId = await mkDeck();
    const id = await insertReminder(deckId);
    await t.pool.query(
      `UPDATE reminders SET outcome = 'done', dismissed_at = now() WHERE item_id = $1`,
      [id],
    );
    const next = '2031-01-01T00:00:00.000Z';
    await t.pool.query(`UPDATE items SET payload = $2::jsonb WHERE id = $1`, [
      id,
      payload({ deadline: next, showBefore: { amount: 0, unit: 'minutes' } }),
    ]);
    expect((await revealAt(id))?.toISOString()).toBe(next);
    const row = await t.pool.query(`SELECT deadline, outcome FROM reminders WHERE item_id = $1`, [
      id,
    ]);
    expect(row.rows[0].deadline.toISOString()).toBe(next);
    expect(row.rows[0].outcome).toBe('done');
  });

  it('rejects a reminder payload without a valid show-before unit', async () => {
    const deckId = await mkDeck();
    await expect(
      insertReminder(deckId, payload({ showBefore: { amount: 1, unit: 'weeks' } })),
    ).rejects.toMatchObject({ message: expect.stringContaining('reminder_payload_invalid') });
  });

  it('clears reveal_at and drops the reminders row when the type changes', async () => {
    const deckId = await mkDeck();
    const id = await insertReminder(deckId);
    await t.pool.query(`UPDATE items SET type = 'text', payload = '{}'::jsonb WHERE id = $1`, [id]);
    expect(await revealAt(id)).toBeNull();
    const row = await t.pool.query(`SELECT 1 FROM reminders WHERE item_id = $1`, [id]);
    expect(row.rows).toHaveLength(0);
  });

  it('never sets reveal_at on other card types', async () => {
    const deckId = await mkDeck();
    const res = await t.pool.query(
      `INSERT INTO items (deck_id, type, status, title) VALUES ($1, 'text', 'proposed', 'x') RETURNING id`,
      [deckId],
    );
    expect(await revealAt(res.rows[0].id)).toBeNull();
  });

  it('keeps reminder settings out of search_text', async () => {
    const deckId = await mkDeck();
    const id = await insertReminder(deckId, payload({ timeZone: 'Europe/Zurich' }));
    const res = await t.pool.query(`SELECT search_text FROM items WHERE id = $1`, [id]);
    expect(res.rows[0].search_text).not.toContain('zurich');
    expect(res.rows[0].search_text).toContain('rent');
  });
});
