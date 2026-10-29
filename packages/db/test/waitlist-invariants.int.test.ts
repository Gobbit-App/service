import { describe, it, expect, beforeEach } from 'vitest';
import { withTestDb } from './db-fixture';

describe('waitlist invariants (D217, D221, D240)', () => {
  const t = withTestDb();

  beforeEach(async () => {
    await t.pool.query('DELETE FROM waitlist_events');
    await t.pool.query('DELETE FROM waitlist_entries');
  });

  let seq = 0;
  const email = () => `person${++seq}@example.test`;

  async function mkUser(): Promise<string> {
    const account = await t.pool.query('INSERT INTO accounts (name) VALUES ($1) RETURNING id', [
      'Test',
    ]);
    const user = await t.pool.query(
      'INSERT INTO users (account_id, email, display_name) VALUES ($1, $2, $3) RETURNING id',
      [account.rows[0].id, email(), 'Person'],
    );
    return user.rows[0].id;
  }

  type Entry = Record<string, unknown>;

  async function insert(entry: Entry): Promise<string> {
    const row: Entry = {
      email: email(),
      kind: 'family',
      source: 'landing',
      status: 'pending',
      confirm_token_hash: `hash-${++seq}`,
      confirm_expires_at: new Date(Date.now() + 86_400_000),
      ...entry,
    };
    const cols = Object.keys(row);
    const result = await t.pool.query(
      `INSERT INTO waitlist_entries (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
      Object.values(row),
    );
    return result.rows[0].id;
  }

  async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
    await expect(promise).rejects.toMatchObject({ code });
  }

  const confirmed = { status: 'confirmed', confirm_token_hash: null, confirmed_at: new Date() };

  it.each<[string, Entry]>([
    ['upper-case email', { email: 'Parent@example.test' }],
    ['padded email', { email: ' parent@example.test' }],
    ['501-character note', { note: 'x'.repeat(501) }],
    ['malformed utm', { utm_source: 'Bad Tag' }],
    ['pending without token', { confirm_token_hash: null }],
    ['pending without expiry', { confirm_expires_at: null }],
    ['confirmed without confirmed_at', { ...confirmed, confirmed_at: null }],
    ['invited without invited_at', { ...confirmed, status: 'invited' }],
    ['removed without removed_at', { status: 'removed' }],
  ])('rejects %s', async (_label, entry) => {
    await expectCode(insert(entry), '23514');
  });

  it('accepts a 500-character note and a valid utm tag', async () => {
    await expect(
      insert({ note: 'x'.repeat(500), utm_source: 'school-group_2' }),
    ).resolves.toBeTruthy();
  });

  it('allows one live entry per email; a removed email can join again', async () => {
    const address = email();
    await insert({ email: address, status: 'removed', removed_at: new Date() });
    await insert({ email: address });
    await expectCode(insert({ email: address, ...confirmed }), '23505');
  });

  it('sets user_id and invited_by to null when the user is deleted', async () => {
    const userId = await mkUser();
    const id = await insert({
      ...confirmed,
      status: 'invited',
      invited_at: new Date(),
      invited_by: userId,
      user_id: userId,
    });
    await t.pool.query('DELETE FROM users WHERE id = $1', [userId]);
    const row = await t.pool.query(
      'SELECT user_id, invited_by, status FROM waitlist_entries WHERE id = $1',
      [id],
    );
    expect(row.rows[0]).toEqual({ user_id: null, invited_by: null, status: 'invited' });
  });

  it('keeps events when their entry is deleted, and nulls the actor when the user is deleted', async () => {
    const userId = await mkUser();
    const id = await insert({});
    await t.pool.query(
      "INSERT INTO waitlist_events (entry_id, action, source) VALUES ($1, 'created', 'landing')",
      [id],
    );
    await t.pool.query(
      "INSERT INTO waitlist_events (entry_id, action, actor_id) VALUES ($1, 'removed', $2)",
      [id, userId],
    );
    await t.pool.query('DELETE FROM waitlist_entries WHERE id = $1', [id]);
    await t.pool.query('DELETE FROM users WHERE id = $1', [userId]);
    const events = await t.pool.query(
      'SELECT action, actor_id FROM waitlist_events WHERE entry_id = $1 ORDER BY action',
      [id],
    );
    expect(events.rows).toEqual([
      { action: 'created', actor_id: null },
      { action: 'removed', actor_id: null },
    ]);
  });

  it('moves updated_at on update', async () => {
    const id = await insert({});
    const before = await t.pool.query('SELECT updated_at FROM waitlist_entries WHERE id = $1', [
      id,
    ]);
    await new Promise((r) => setTimeout(r, 5));
    await t.pool.query("UPDATE waitlist_entries SET note = 'later' WHERE id = $1", [id]);
    const after = await t.pool.query('SELECT updated_at FROM waitlist_entries WHERE id = $1', [id]);
    expect(after.rows[0].updated_at.getTime()).toBeGreaterThan(before.rows[0].updated_at.getTime());
  });

  describe('waitlist_summary (D221)', () => {
    it('counts entries per week, kind, source and effective status', async () => {
      const week1 = new Date('2026-11-03T10:00:00Z'); // Tuesday → week of 2026-11-02
      const week2 = new Date('2026-11-10T10:00:00Z'); // → week of 2026-11-09
      const joinedUser = await mkUser();
      const invitedUser = await mkUser();
      const invited = { ...confirmed, status: 'invited', invited_at: new Date() };
      await t.pool.query(
        "INSERT INTO sessions (user_id, token_hash, kind, expires_at) VALUES ($1, 'tok-joined', 'cookie', now() + interval '1 day')",
        [joinedUser],
      );

      await insert({ created_at: week1 });
      await insert({ created_at: week1 });
      await insert({ created_at: week1, ...confirmed });
      await insert({ created_at: week1, kind: 'community', source: 'sign_in' });
      await insert({ created_at: week2, ...invited, user_id: joinedUser });
      await insert({ created_at: week2, ...invited, user_id: invitedUser });
      await insert({ created_at: week2, status: 'removed', removed_at: new Date() });

      const result = await t.pool.query(
        'SELECT week::text, kind, source, status, entries FROM waitlist_summary ORDER BY week, kind, source, status',
      );
      expect(result.rows).toEqual([
        { week: '2026-11-02', kind: 'family', source: 'landing', status: 'confirmed', entries: 1 },
        { week: '2026-11-02', kind: 'family', source: 'landing', status: 'pending', entries: 2 },
        { week: '2026-11-02', kind: 'community', source: 'sign_in', status: 'pending', entries: 1 },
        { week: '2026-11-09', kind: 'family', source: 'landing', status: 'invited', entries: 1 },
        { week: '2026-11-09', kind: 'family', source: 'landing', status: 'joined', entries: 1 },
        { week: '2026-11-09', kind: 'family', source: 'landing', status: 'removed', entries: 1 },
      ]);
    });
  });
});
