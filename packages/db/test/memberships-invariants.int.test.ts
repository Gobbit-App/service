import { describe, it, expect } from 'vitest';
import { withTestDb } from './db-fixture';
import { addMember, createAccountUser, createDeck } from './factories';

describe('memberships invariants (D36, D44)', () => {
  const t = withTestDb();

  it('rejects a membership for a user of the deck owner account (P0001)', async () => {
    const owner = await createAccountUser(t.db);
    const deck = await createDeck(t.db, owner);

    await expect(addMember(t.db, deck, owner, 'reader')).rejects.toMatchObject({
      cause: expect.objectContaining({ code: 'P0001', message: 'owner_account_membership' }),
    });
  });

  it('accepts a membership for a user of another account', async () => {
    const owner = await createAccountUser(t.db);
    const other = await createAccountUser(t.db);
    const deck = await createDeck(t.db, owner);

    const row = await addMember(t.db, deck, other, 'editor');
    expect(row.role).toBe('editor');
  });

  it('advances updated_at on update', async () => {
    const owner = await createAccountUser(t.db);
    const other = await createAccountUser(t.db);
    const deck = await createDeck(t.db, owner);
    const row = await addMember(t.db, deck, other, 'reader');

    await new Promise((resolve) => setTimeout(resolve, 20));
    const { rows } = await t.pool.query(
      `UPDATE memberships SET role = 'editor' WHERE id = $1 RETURNING updated_at`,
      [row.id],
    );
    expect((rows[0].updated_at as Date).getTime()).toBeGreaterThan(row.updatedAt.getTime());
  });
});
