import { describe, it, expect } from 'vitest';
import { withTestDb } from './db-fixture';

/** D95: a live published item has at least one category, checked at commit. */
describe('published ⇒ ≥ 1 category (D95)', () => {
  const t = withTestDb();

  async function mkDeck(): Promise<{ deckId: string; categoryId: string }> {
    const account = await t.pool.query(`INSERT INTO accounts (name) VALUES ('T') RETURNING id`);
    const deck = await t.pool.query(
      `INSERT INTO decks (kind, slug, name, owner_account_id, is_public)
       VALUES ('shared', $1, 'D', $2, false) RETURNING id`,
      [`pc-${crypto.randomUUID().slice(0, 8)}`, account.rows[0].id],
    );
    const deckId: string = deck.rows[0].id;
    const cat = await t.pool.query(`SELECT id FROM categories WHERE deck_id = $1`, [deckId]);
    return { deckId, categoryId: cat.rows[0].id };
  }

  async function insertItem(deckId: string, status: string): Promise<string> {
    const res = await t.pool.query(
      `INSERT INTO items (deck_id, type, status, title) VALUES ($1, 'text', $2, 'x') RETURNING id`,
      [deckId, status],
    );
    return res.rows[0].id;
  }

  async function expectNeedsCategory(run: () => Promise<unknown>): Promise<void> {
    await expect(run()).rejects.toMatchObject({
      code: 'P0001',
      message: expect.stringContaining('item_needs_category'),
    });
  }

  it('rejects a published item without categories at commit', async () => {
    const { deckId } = await mkDeck();
    await expectNeedsCategory(() => insertItem(deckId, 'published'));
  });

  it('allows a proposed item without categories', async () => {
    const { deckId } = await mkDeck();
    await expect(insertItem(deckId, 'proposed')).resolves.toBeTypeOf('string');
  });

  it('defers the check: insert then add categories in one transaction', async () => {
    const { deckId, categoryId } = await mkDeck();
    const client = await t.pool.connect();
    try {
      await client.query('BEGIN');
      const res = await client.query(
        `INSERT INTO items (deck_id, type, status, title) VALUES ($1, 'text', 'published', 'x') RETURNING id`,
        [deckId],
      );
      await client.query(
        `INSERT INTO item_categories (item_id, category_id, deck_id) VALUES ($1, $2, $3)`,
        [res.rows[0].id, categoryId, deckId],
      );
      await expect(client.query('COMMIT')).resolves.toBeDefined();
    } finally {
      client.release();
    }
  });

  it('rejects publishing a proposal that has no categories', async () => {
    const { deckId } = await mkDeck();
    const id = await insertItem(deckId, 'proposed');
    await expectNeedsCategory(() =>
      t.pool.query(`UPDATE items SET status = 'published' WHERE id = $1`, [id]),
    );
  });

  it('rejects removing the last category of a published item', async () => {
    const { deckId, categoryId } = await mkDeck();
    const client = await t.pool.connect();
    let itemId: string;
    try {
      await client.query('BEGIN');
      const res = await client.query(
        `INSERT INTO items (deck_id, type, status, title) VALUES ($1, 'text', 'published', 'x') RETURNING id`,
        [deckId],
      );
      itemId = res.rows[0].id;
      await client.query(
        `INSERT INTO item_categories (item_id, category_id, deck_id) VALUES ($1, $2, $3)`,
        [itemId, categoryId, deckId],
      );
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    await expectNeedsCategory(() =>
      t.pool.query(`DELETE FROM item_categories WHERE item_id = $1`, [itemId]),
    );
  });

  it('allows swapping categories inside one transaction', async () => {
    const { deckId, categoryId } = await mkDeck();
    const other = await t.pool.query(
      `INSERT INTO categories (deck_id, slug, name) VALUES ($1, 'other', 'Other') RETURNING id`,
      [deckId],
    );
    const client = await t.pool.connect();
    try {
      await client.query('BEGIN');
      const res = await client.query(
        `INSERT INTO items (deck_id, type, status, title) VALUES ($1, 'text', 'published', 'x') RETURNING id`,
        [deckId],
      );
      const itemId = res.rows[0].id;
      await client.query(
        `INSERT INTO item_categories (item_id, category_id, deck_id) VALUES ($1, $2, $3)`,
        [itemId, categoryId, deckId],
      );
      await client.query(`DELETE FROM item_categories WHERE item_id = $1`, [itemId]);
      await client.query(
        `INSERT INTO item_categories (item_id, category_id, deck_id) VALUES ($1, $2, $3)`,
        [itemId, other.rows[0].id, deckId],
      );
      await expect(client.query('COMMIT')).resolves.toBeDefined();
    } finally {
      client.release();
    }
  });

  it('ignores soft-deleted items', async () => {
    const { deckId } = await mkDeck();
    const id = await insertItem(deckId, 'proposed');
    await t.pool.query(`UPDATE items SET deleted_at = now() WHERE id = $1`, [id]);
    await expect(
      t.pool.query(`UPDATE items SET status = 'published' WHERE id = $1`, [id]),
    ).resolves.toBeDefined();
  });
});
