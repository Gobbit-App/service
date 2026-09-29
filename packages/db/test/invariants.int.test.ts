import { describe, it, expect } from 'vitest';
import { withTestDb } from './db-fixture';

describe('database invariants (P1.2/D7)', () => {
  const t = withTestDb();

  // Helper to create account
  async function mkAccount(name: string = 'Test'): Promise<string> {
    const result = await t.pool.query('INSERT INTO accounts (name) VALUES ($1) RETURNING id', [
      name,
    ]);
    return result.rows[0].id;
  }

  // Helper to create deck
  async function mkDeck(slug: string): Promise<string> {
    const accountId = await mkAccount();
    const result = await t.pool.query(
      'INSERT INTO decks (kind, slug, name, owner_account_id, is_public) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      ['shared', slug, 'Test Deck', accountId, false],
    );
    return result.rows[0].id;
  }

  describe('(1) default category creation', () => {
    it('new deck creates exactly one default general category', async () => {
      const pbId = await mkDeck(`test-1-${Date.now()}`);

      const result = await t.pool.query('SELECT * FROM categories WHERE deck_id = $1', [pbId]);

      expect(result.rows).toHaveLength(1);
      const cat = result.rows[0];
      expect(cat.slug).toBe('general');
      expect(cat.name).toBe('General');
      expect(cat.is_default).toBe(true);
      expect(cat.visibility).toBe('shared');
      expect(cat.position).toBe(0);
      expect(cat.deleted_at).toBeNull();
    });
  });

  describe('(2) default category protection', () => {
    it('DELETE default category rejects with P0001 default_category_protected', async () => {
      const pbId = await mkDeck(`test-2a-${Date.now()}`);

      const catResult = await t.pool.query(
        'SELECT id FROM categories WHERE deck_id = $1 AND is_default = true',
        [pbId],
      );
      const catId = catResult.rows[0].id;

      try {
        await t.pool.query('DELETE FROM categories WHERE id = $1', [catId]);
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.code).toBe('P0001');
        expect(err.message).toContain('default_category_protected');
      }
    });

    it('soft DELETE default category (SET deleted_at=now) rejects with P0001', async () => {
      const pbId = await mkDeck(`test-2b-${Date.now()}`);

      const catResult = await t.pool.query(
        'SELECT id FROM categories WHERE deck_id = $1 AND is_default = true',
        [pbId],
      );
      const catId = catResult.rows[0].id;

      try {
        await t.pool.query('UPDATE categories SET deleted_at = now() WHERE id = $1', [catId]);
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.code).toBe('P0001');
        expect(err.message).toContain('default_category_protected');
      }
    });

    it('UPDATE SET is_default=false on default category rejects with P0001', async () => {
      const pbId = await mkDeck(`test-2c-${Date.now()}`);

      const catResult = await t.pool.query(
        'SELECT id FROM categories WHERE deck_id = $1 AND is_default = true',
        [pbId],
      );
      const catId = catResult.rows[0].id;

      try {
        await t.pool.query('UPDATE categories SET is_default = false WHERE id = $1', [catId]);
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.code).toBe('P0001');
        expect(err.message).toContain('default_category_protected');
      }
    });
  });

  describe('(3) non-default category deletion', () => {
    it('DELETE non-default category succeeds', async () => {
      const pbId = await mkDeck(`test-3a-${Date.now()}`);

      const catResult = await t.pool.query(
        'INSERT INTO categories (deck_id, slug, name, visibility, position) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [pbId, 'x', 'X', 'shared', 1],
      );
      const catId = catResult.rows[0].id;

      await t.pool.query('DELETE FROM categories WHERE id = $1', [catId]);

      const checkResult = await t.pool.query('SELECT * FROM categories WHERE id = $1', [catId]);
      expect(checkResult.rows).toHaveLength(0);
    });

    it('soft DELETE non-default category succeeds', async () => {
      const pbId = await mkDeck(`test-3b-${Date.now()}`);

      const catResult = await t.pool.query(
        'INSERT INTO categories (deck_id, slug, name, visibility, position) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [pbId, 'y', 'Y', 'shared', 1],
      );
      const catId = catResult.rows[0].id;

      await t.pool.query('UPDATE categories SET deleted_at = now() WHERE id = $1', [catId]);

      const checkResult = await t.pool.query('SELECT deleted_at FROM categories WHERE id = $1', [
        catId,
      ]);
      expect(checkResult.rows[0].deleted_at).not.toBeNull();
    });
  });

  describe('(4) unique default category constraint', () => {
    it('inserting second is_default=true in same deck rejects with 23505', async () => {
      const pbId = await mkDeck(`test-4-${Date.now()}`);

      try {
        await t.pool.query(
          'INSERT INTO categories (deck_id, slug, name, is_default, visibility, position) VALUES ($1, $2, $3, $4, $5, $6)',
          [pbId, 'second-default', 'Second Default', true, 'shared', 1],
        );
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.code).toBe('23505');
      }
    });
  });

  describe('(5) updated_at advances', () => {
    it.each([
      {
        name: 'accounts',
        create: async () => {
          const res = await t.pool.query('INSERT INTO accounts (name) VALUES ($1) RETURNING id', [
            'Test',
          ]);
          return res.rows[0].id;
        },
        update: async (id: string) => {
          await t.pool.query('UPDATE accounts SET name = $1 WHERE id = $2', ['Updated', id]);
        },
      },
      {
        name: 'users',
        create: async () => {
          const accRes = await t.pool.query(
            'INSERT INTO accounts (name) VALUES ($1) RETURNING id',
            ['Test'],
          );
          const accId = accRes.rows[0].id;
          const res = await t.pool.query(
            'INSERT INTO users (account_id, email, display_name) VALUES ($1, $2, $3) RETURNING id',
            [accId, `test-${Date.now()}-${Math.random()}@test.com`, 'Test User'],
          );
          return res.rows[0].id;
        },
        update: async (id: string) => {
          await t.pool.query('UPDATE users SET display_name = $1 WHERE id = $2', ['Updated', id]);
        },
      },
      {
        name: 'decks',
        create: async () => {
          return mkDeck(`test-pb-${Date.now()}-${Math.random()}`);
        },
        update: async (id: string) => {
          await t.pool.query('UPDATE decks SET name = $1 WHERE id = $2', ['Updated', id]);
        },
      },
      {
        name: 'categories',
        create: async () => {
          const pbId = await mkDeck(`test-cat-${Date.now()}-${Math.random()}`);
          const res = await t.pool.query(
            'INSERT INTO categories (deck_id, slug, name, visibility, position) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [pbId, 'test-cat', 'Test Category', 'shared', 1],
          );
          return res.rows[0].id;
        },
        update: async (id: string) => {
          await t.pool.query('UPDATE categories SET name = $1 WHERE id = $2', ['Updated', id]);
        },
      },
      {
        name: 'items',
        create: async () => {
          const pbId = await mkDeck(`test-item-${Date.now()}-${Math.random()}`);
          const res = await t.pool.query(
            'INSERT INTO items (deck_id, type, title) VALUES ($1, $2, $3) RETURNING id',
            [pbId, 'text', 'Test Item'],
          );
          return res.rows[0].id;
        },
        update: async (id: string) => {
          await t.pool.query('UPDATE items SET title = $1 WHERE id = $2', ['Updated', id]);
        },
      },
    ])('$name: updated_at advances after update', async ({ name, create, update }) => {
      const id = await create();

      const beforeRes = await t.pool.query(`SELECT updated_at FROM ${name} WHERE id = $1`, [id]);
      const before = beforeRes.rows[0].updated_at as Date;

      await new Promise((r) => setTimeout(r, 15));

      await update(id);

      const afterRes = await t.pool.query(`SELECT updated_at FROM ${name} WHERE id = $1`, [id]);
      const after = afterRes.rows[0].updated_at as Date;

      expect(after.getTime()).toBeGreaterThan(before.getTime());
    });
  });

  describe('(6) cascade delete', () => {
    it('hard DELETE deck cascades to categories', async () => {
      const pbId = await mkDeck(`test-6a-${Date.now()}`);

      const catRes = await t.pool.query('SELECT id FROM categories WHERE deck_id = $1', [pbId]);
      const catId = catRes.rows[0].id;

      await t.pool.query('DELETE FROM decks WHERE id = $1', [pbId]);

      const checkRes = await t.pool.query('SELECT * FROM categories WHERE id = $1', [catId]);
      expect(checkRes.rows).toHaveLength(0);
    });

    it('hard DELETE deck cascades with items and item_categories', async () => {
      const pbId = await mkDeck(`test-6b-${Date.now()}`);

      const catRes = await t.pool.query('SELECT id FROM categories WHERE deck_id = $1', [pbId]);
      const catId = catRes.rows[0].id;

      const itemRes = await t.pool.query(
        'INSERT INTO items (deck_id, type, title) VALUES ($1, $2, $3) RETURNING id',
        [pbId, 'text', 'Test Item'],
      );
      const itemId = itemRes.rows[0].id;

      await t.pool.query(
        'INSERT INTO item_categories (item_id, category_id, deck_id) VALUES ($1, $2, $3)',
        [itemId, catId, pbId],
      );

      await t.pool.query('DELETE FROM decks WHERE id = $1', [pbId]);

      const itemCheckRes = await t.pool.query('SELECT * FROM items WHERE id = $1', [itemId]);
      expect(itemCheckRes.rows).toHaveLength(0);

      const catCheckRes = await t.pool.query('SELECT * FROM categories WHERE id = $1', [catId]);
      expect(catCheckRes.rows).toHaveLength(0);

      const icCheckRes = await t.pool.query('SELECT * FROM item_categories WHERE item_id = $1', [
        itemId,
      ]);
      expect(icCheckRes.rows).toHaveLength(0);
    });
  });
});
