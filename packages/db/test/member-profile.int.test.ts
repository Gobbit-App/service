import { describe, expect, it } from 'vitest';
import { withTestDb } from './db-fixture';
import { createAccountUser, createDeck, makeProfileAsset } from './factories';

/** 046: DB invariants of the member profile (D417-D429). */
describe('member profile (DB invariants)', () => {
  const ctx = withTestDb();

  const setCol = (id: string, col: string, value: unknown) =>
    ctx.pool.query(`UPDATE users SET ${col} = $2 WHERE id = $1`, [id, value]);

  it('rejects malformed usernames', async () => {
    const u = await createAccountUser(ctx.db);
    for (const bad of ['ab', 'a'.repeat(31), 'da@na', '.dana', ' dana', 'dana ']) {
      await expect(setCol(u.id, 'username', bad)).rejects.toThrow(/users_username_format_chk/);
    }
    await setCol(u.id, 'username', 'abc');
    await setCol(u.id, 'username', 'a'.repeat(30));
  });

  it('bounds and trims names and location', async () => {
    const u = await createAccountUser(ctx.db);
    await expect(setCol(u.id, 'first_name', 'a'.repeat(61))).rejects.toThrow(
      /users_first_name_chk/,
    );
    await expect(setCol(u.id, 'last_name', 'a'.repeat(61))).rejects.toThrow(/users_last_name_chk/);
    await expect(setCol(u.id, 'location', 'a'.repeat(101))).rejects.toThrow(/users_location_chk/);
    await expect(setCol(u.id, 'first_name', ' Dana')).rejects.toThrow(/users_first_name_chk/);
    await expect(setCol(u.id, 'last_name', 'Dana ')).rejects.toThrow(/users_last_name_chk/);
    await expect(setCol(u.id, 'location', ' Haifa')).rejects.toThrow(/users_location_chk/);
    await setCol(u.id, 'first_name', 'a'.repeat(60));
    await setCol(u.id, 'location', 'a'.repeat(100));
  });

  it('requires an avatar to be an object with a publicId', async () => {
    const u = await createAccountUser(ctx.db);
    await expect(setCol(u.id, 'avatar', JSON.stringify({ width: 10 }))).rejects.toThrow(
      /users_avatar_shape_chk/,
    );
    await expect(setCol(u.id, 'avatar', JSON.stringify({ publicId: 5 }))).rejects.toThrow(
      /users_avatar_shape_chk/,
    );
    await setCol(u.id, 'avatar', JSON.stringify({ publicId: 'p1', width: 10 }));
  });

  it('keeps usernames unique ignoring case', async () => {
    const a = await createAccountUser(ctx.db);
    const b = await createAccountUser(ctx.db);
    await setCol(a.id, 'username', 'Dana');
    await expect(setCol(b.id, 'username', 'dana')).rejects.toThrow(/users_username_lower_uq/);
  });

  it('lets exactly one of two concurrent claims win', async () => {
    const a = await createAccountUser(ctx.db);
    const b = await createAccountUser(ctx.db);
    const results = await Promise.allSettled([
      setCol(a.id, 'username', 'racer'),
      setCol(b.id, 'username', 'Racer'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  });

  it('holds a released username for its releaser until the hold expires', async () => {
    const releaser = await createAccountUser(ctx.db);
    const other = await createAccountUser(ctx.db);
    const hold = (name: string, until: Date) =>
      ctx.pool.query(
        `INSERT INTO username_holds (username_lower, released_by, hold_until) VALUES ($1, $2, $3)`,
        [name, releaser.id, until],
      );
    await hold('held-name', new Date(Date.now() + 86_400_000));
    await expect(setCol(other.id, 'username', 'Held-Name')).rejects.toThrow(/username_held/);
    await setCol(releaser.id, 'username', 'Held-Name');

    await hold('old-name', new Date(Date.now() - 1000));
    await setCol(other.id, 'username', 'old-name');
  });

  it('ties asset scope to deck_id', async () => {
    const u = await createAccountUser(ctx.db);
    const deck = await createDeck(ctx.db, u);
    await expect(
      ctx.pool.query(
        `INSERT INTO assets (scope, deck_id, public_id, source) VALUES ('deck', NULL, 'x1', 'editor')`,
      ),
    ).rejects.toThrow(/assets_scope_chk/);
    await expect(
      ctx.pool.query(
        `INSERT INTO assets (scope, deck_id, owner_user_id, public_id, source) VALUES ('profile', $1, $2, 'x2', 'editor')`,
        [deck.id, u.id],
      ),
    ).rejects.toThrow(/assets_scope_chk/);
    await expect(
      ctx.pool.query(
        `INSERT INTO assets (scope, deck_id, public_id, source) VALUES ('other', $1, 'x3', 'editor')`,
        [deck.id],
      ),
    ).rejects.toThrow(/assets_scope/);
    const row = await makeProfileAsset(ctx.db, u.id);
    expect(row.deckId).toBeNull();
    expect(row.scope).toBe('profile');
  });
});
