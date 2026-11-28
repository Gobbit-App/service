import { describe, it, expect, beforeAll } from 'vitest';
import { runMigrations, rollbackLatest, getLatestMigrationTag } from '../src/migrations';
import { withTestDb } from './db-fixture';

// 052: deck_invite_links CHECKs, FKs, magic_links.invite_link_id and the D477 waitlist tidy.
describe('deck_invite_links (052)', () => {
  const t = withTestDb();
  let seq = 0;

  async function mkUser(
    email = `inv${++seq}@example.test`,
  ): Promise<{ id: string; accountId: string }> {
    const a = await t.pool.query('INSERT INTO accounts (name) VALUES ($1) RETURNING id', ['T']);
    const u = await t.pool.query(
      'INSERT INTO users (account_id, email, display_name) VALUES ($1, $2, $3) RETURNING id',
      [a.rows[0].id, email, 'P'],
    );
    return { id: u.rows[0].id, accountId: a.rows[0].id };
  }

  async function mkDeck(accountId: string): Promise<string> {
    const d = await t.pool.query(
      `INSERT INTO decks (kind, slug, name, owner_account_id, is_public)
       VALUES ('shared', $1, 'D', $2, false) RETURNING id`,
      [`inv-${++seq}`, accountId],
    );
    return d.rows[0].id;
  }

  let owner: { id: string; accountId: string };
  let deckId: string;
  beforeAll(async () => {
    owner = await mkUser();
    deckId = await mkDeck(owner.accountId);
  });

  async function insertLink(over: Record<string, unknown> = {}, deck = deckId): Promise<string> {
    const row: Record<string, unknown> = {
      deck_id: deck,
      token: `tok-${++seq}`,
      name: 'Family',
      role: 'reader',
      created_by: owner.id,
      expires_at: new Date(Date.now() + 86_400_000),
      ...over,
    };
    const cols = Object.keys(row);
    const r = await t.pool.query(
      `INSERT INTO deck_invite_links (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
      Object.values(row),
    );
    return r.rows[0].id;
  }

  const expectCode = (p: Promise<unknown>, code: string) =>
    expect(p).rejects.toMatchObject({ code });

  it('accepts a valid link and stamps updated_at on update', async () => {
    const id = await insertLink();
    const before = await t.pool.query('SELECT updated_at FROM deck_invite_links WHERE id = $1', [
      id,
    ]);
    await new Promise((r) => setTimeout(r, 5));
    await t.pool.query("UPDATE deck_invite_links SET name = 'Other' WHERE id = $1", [id]);
    const after = await t.pool.query('SELECT updated_at FROM deck_invite_links WHERE id = $1', [
      id,
    ]);
    expect(after.rows[0].updated_at.getTime()).toBeGreaterThan(before.rows[0].updated_at.getTime());
  });

  it('refuses the owner role', async () => {
    await expectCode(insertLink({ role: 'owner' }), '23514');
  });

  it.each([0, 61])('refuses a name of %i characters', async (n) => {
    await expectCode(insertLink({ name: 'x'.repeat(n) }), '23514');
  });

  it('accepts names of 1 and 60 characters', async () => {
    await insertLink({ name: 'x' });
    await insertLink({ name: 'x'.repeat(60) });
  });

  it('refuses accepted and revoked together', async () => {
    await expectCode(insertLink({ accepted_at: new Date(), revoked_at: new Date() }), '23514');
  });

  it('refuses accepted_by without accepted_at, accepts it with', async () => {
    await expectCode(insertLink({ accepted_by: owner.id }), '23514');
    await insertLink({ accepted_at: new Date(), accepted_by: owner.id });
  });

  it('refuses a duplicate token', async () => {
    await insertLink({ token: 'dup-token' });
    await expectCode(insertLink({ token: 'dup-token' }), '23505');
  });

  it('allows invite_link_id only on sign_in magic links', async () => {
    const id = await insertLink();
    const ml = (purpose: string) =>
      t.pool.query(
        'INSERT INTO magic_links (email, token_hash, purpose, invite_link_id, expires_at) VALUES ($1, $2, $3, $4, now())',
        [`ml${++seq}@example.test`, `h-${seq}`, purpose, id],
      );
    await expectCode(ml('invite'), '23514');
    await ml('sign_in');
  });

  it('cascades on deck delete and nulls created_by on creator delete', async () => {
    const creator = await mkUser();
    const d = await mkDeck(owner.accountId);
    const id = await insertLink({ created_by: creator.id }, d);
    await t.pool.query('DELETE FROM users WHERE id = $1', [creator.id]);
    const r = await t.pool.query('SELECT created_by FROM deck_invite_links WHERE id = $1', [id]);
    expect(r.rows[0].created_by).toBeNull();
    await t.pool.query('DELETE FROM decks WHERE id = $1', [d]);
    const gone = await t.pool.query('SELECT 1 FROM deck_invite_links WHERE id = $1', [id]);
    expect(gone.rowCount).toBe(0);
  });
});

describe('0030 waitlist tidy (D477)', () => {
  const t = withTestDb({ template: false });

  it('removes live entries whose address has a user, with a null-actor event, and leaves others', async () => {
    await runMigrations(t.pool);
    expect(await rollbackLatest(t.pool)).toBe('0031_membership_welcome');
    expect(await rollbackLatest(t.pool)).toBe('0030_deck_invite_links');
    expect(await getLatestMigrationTag(t.pool)).toBe('0029_invited_by_email');

    const a = await t.pool.query("INSERT INTO accounts (name) VALUES ('T') RETURNING id");
    await t.pool.query(
      "INSERT INTO users (account_id, email, display_name) VALUES ($1, 'Known@Example.test', 'K')",
      [a.rows[0].id],
    );
    const entry = async (email: string, status: 'confirmed') =>
      (
        await t.pool.query(
          `INSERT INTO waitlist_entries (email, kind, source, status, confirmed_at)
           VALUES ($1, 'family', 'landing', $2, now()) RETURNING id`,
          [email, status],
        )
      ).rows[0].id as string;
    const known = await entry('known@example.test', 'confirmed');
    const other = await entry('other@example.test', 'confirmed');

    await runMigrations(t.pool);

    const rows = await t.pool.query('SELECT id, status, removed_by FROM waitlist_entries');
    const byId = Object.fromEntries(rows.rows.map((r) => [r.id, r]));
    expect(byId[known]).toMatchObject({ status: 'removed', removed_by: null });
    expect(byId[other].status).toBe('confirmed');
    const ev = await t.pool.query('SELECT entry_id, action, actor_id FROM waitlist_events');
    expect(ev.rows).toEqual([{ entry_id: known, action: 'removed', actor_id: null }]);
  });
});
