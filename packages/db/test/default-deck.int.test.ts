import { describe, it, expect } from 'vitest';
import { withTestDb } from './db-fixture';

describe('personal deck invariants (Phase 3B)', () => {
  const t = withTestDb();

  async function mkAccount(): Promise<string> {
    const result = await t.pool.query('INSERT INTO accounts (name) VALUES ($1) RETURNING id', [
      'Test',
    ]);
    return result.rows[0].id;
  }

  async function mkDeck(
    accountId: string,
    opts: { slug?: string; kind?: string; isDefault?: boolean } = {},
  ): Promise<string> {
    const slug = opts.slug ?? `deck-${Math.random().toString(36).slice(2)}`;
    const result = await t.pool.query(
      'INSERT INTO decks (kind, slug, name, owner_account_id, is_default) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [opts.kind ?? 'personal', slug, 'Deck', accountId, opts.isDefault ?? false],
    );
    return result.rows[0].id;
  }

  async function expectError(promise: Promise<unknown>, code: string): Promise<Error> {
    try {
      await promise;
    } catch (err) {
      expect((err as { code?: string }).code).toBe(code);
      return err as Error;
    }
    throw new Error(`Expected SQLSTATE ${code}`);
  }

  it('allows one active default deck per account and rejects a second', async () => {
    const accountId = await mkAccount();
    await mkDeck(accountId, { isDefault: true });

    await expectError(mkDeck(accountId, { isDefault: true }), '23505');
  });

  it('allows a default deck per account independently (one per account)', async () => {
    const accountId = await mkAccount();
    const otherAccountId = await mkAccount();
    await mkDeck(accountId, { isDefault: true });

    await expect(mkDeck(otherAccountId, { isDefault: true })).resolves.toBeTruthy();
  });

  it('rejects is_default on a non-personal kind', async () => {
    const accountId = await mkAccount();

    await expectError(mkDeck(accountId, { kind: 'shared', isDefault: true }), '23514');
  });

  it('rejects the reserved slug "me"', async () => {
    const accountId = await mkAccount();

    await expectError(mkDeck(accountId, { slug: 'me' }), '23514');
  });

  it('rejects hard DELETE of the default deck with default_deck_protected', async () => {
    const accountId = await mkAccount();
    const deckId = await mkDeck(accountId, { isDefault: true });

    const err = await expectError(
      t.pool.query('DELETE FROM decks WHERE id = $1', [deckId]),
      'P0001',
    );
    expect(err.message).toContain('default_deck_protected');
  });

  it('rejects soft DELETE of the default deck with default_deck_protected', async () => {
    const accountId = await mkAccount();
    const deckId = await mkDeck(accountId, { isDefault: true });

    const err = await expectError(
      t.pool.query('UPDATE decks SET deleted_at = now() WHERE id = $1', [deckId]),
      'P0001',
    );
    expect(err.message).toContain('default_deck_protected');
  });

  it('rejects clearing is_default on the default deck', async () => {
    const accountId = await mkAccount();
    const deckId = await mkDeck(accountId, { isDefault: true });

    const err = await expectError(
      t.pool.query('UPDATE decks SET is_default = false WHERE id = $1', [deckId]),
      'P0001',
    );
    expect(err.message).toContain('default_deck_protected');
  });

  it('allows deleting a non-default deck', async () => {
    const accountId = await mkAccount();
    await mkDeck(accountId, { isDefault: true });
    const deckId = await mkDeck(accountId, { kind: 'shared' });

    const result = await t.pool.query('DELETE FROM decks WHERE id = $1', [deckId]);
    expect(result.rowCount).toBe(1);
  });

  it('allows the account delete to cascade the default deck', async () => {
    const accountId = await mkAccount();
    await mkDeck(accountId, { isDefault: true });

    const result = await t.pool.query('DELETE FROM accounts WHERE id = $1', [accountId]);
    expect(result.rowCount).toBe(1);

    const left = await t.pool.query('SELECT id FROM decks WHERE owner_account_id = $1', [
      accountId,
    ]);
    expect(left.rows).toHaveLength(0);
  });
});
