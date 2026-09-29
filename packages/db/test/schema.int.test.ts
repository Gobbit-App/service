import { describe, it, expect } from 'vitest';
import { withTestDb } from './db-fixture';

describe('schema', () => {
  const t = withTestDb();

  const mkAccount = async () => {
    const result = await t.pool.query('INSERT INTO accounts (name) VALUES ($1) RETURNING id', [
      'Test Account',
    ]);
    return result.rows[0].id;
  };

  const mkDeck = async (slug: string, accountId: string) => {
    const result = await t.pool.query(
      'INSERT INTO decks (kind, slug, name, owner_account_id, is_public) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      ['shared', slug, slug, accountId, false],
    );
    return result.rows[0].id;
  };

  it('items table has correct columns', async () => {
    const result = await t.pool.query(`
      SELECT column_name, data_type, is_nullable, datetime_precision
      FROM information_schema.columns
      WHERE table_name = 'items'
      ORDER BY column_name
    `);

    expect(result.rows).toHaveLength(14);
    expect(result.rows).toEqual([
      {
        column_name: 'body',
        data_type: 'text',
        is_nullable: 'NO',
        datetime_precision: null,
      },
      {
        column_name: 'created_at',
        data_type: 'timestamp with time zone',
        is_nullable: 'NO',
        datetime_precision: 3,
      },
      {
        column_name: 'created_by',
        data_type: 'uuid',
        is_nullable: 'YES',
        datetime_precision: null,
      },
      {
        column_name: 'deck_id',
        data_type: 'uuid',
        is_nullable: 'NO',
        datetime_precision: null,
      },
      {
        column_name: 'deleted_at',
        data_type: 'timestamp with time zone',
        is_nullable: 'YES',
        datetime_precision: 3,
      },
      {
        column_name: 'id',
        data_type: 'uuid',
        is_nullable: 'NO',
        datetime_precision: null,
      },
      {
        column_name: 'payload',
        data_type: 'jsonb',
        is_nullable: 'NO',
        datetime_precision: null,
      },
      {
        column_name: 'source_kind',
        data_type: 'USER-DEFINED',
        is_nullable: 'NO',
        datetime_precision: null,
      },
      {
        column_name: 'source_url',
        data_type: 'text',
        is_nullable: 'YES',
        datetime_precision: null,
      },
      {
        column_name: 'status',
        data_type: 'USER-DEFINED',
        is_nullable: 'NO',
        datetime_precision: null,
      },
      {
        column_name: 'title',
        data_type: 'character varying',
        is_nullable: 'NO',
        datetime_precision: null,
      },
      {
        column_name: 'type',
        data_type: 'USER-DEFINED',
        is_nullable: 'NO',
        datetime_precision: null,
      },
      {
        column_name: 'updated_at',
        data_type: 'timestamp with time zone',
        is_nullable: 'NO',
        datetime_precision: 3,
      },
      {
        column_name: 'verified_at',
        data_type: 'timestamp with time zone',
        is_nullable: 'YES',
        datetime_precision: 3,
      },
    ]);
  });

  it('enforces partial unique slug on decks', async () => {
    const accountId = await mkAccount();

    // First insert succeeds
    await mkDeck('dup', accountId);

    // Second insert fails with 23505
    await expect(mkDeck('dup', accountId)).rejects.toMatchObject({
      code: '23505',
    });

    // Soft-delete first
    await t.pool.query('UPDATE decks SET deleted_at = NOW() WHERE slug = $1', ['dup']);

    // Insert again succeeds
    await expect(mkDeck('dup', accountId)).resolves.toBeDefined();
  });

  it('enforces composite FK on item_categories', async () => {
    const accountA = await mkAccount();
    const accountB = await mkAccount();

    const pbA = await mkDeck('pbA', accountA);
    const pbB = await mkDeck('pbB', accountB);

    // Get default categories
    const catAResult = await t.pool.query(
      'SELECT id FROM categories WHERE deck_id = $1 AND is_default = true',
      [pbA],
    );
    expect(catAResult.rows[0].id).toBeDefined();

    const catBResult = await t.pool.query(
      'SELECT id FROM categories WHERE deck_id = $1 AND is_default = true',
      [pbB],
    );
    const catB = catBResult.rows[0].id;

    // Insert item into deck A
    const itemResult = await t.pool.query(
      'INSERT INTO items (deck_id, type, status, title, body, payload) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [pbA, 'text', 'published', 't', '', '{}'],
    );
    const itemId = itemResult.rows[0].id;

    // Try to insert item_categories with item from A but category from B
    await expect(
      t.pool.query(
        'INSERT INTO item_categories (item_id, category_id, deck_id) VALUES ($1, $2, $3)',
        [itemId, catB, pbA],
      ),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('enforces partial unique email on users', async () => {
    const accountA = await mkAccount();
    const accountB = await mkAccount();

    // Insert first user
    await t.pool.query('INSERT INTO users (account_id, email, display_name) VALUES ($1, $2, $3)', [
      accountA,
      'test@example.com',
      'User A',
    ]);

    // Try to insert second user with same email
    await expect(
      t.pool.query('INSERT INTO users (account_id, email, display_name) VALUES ($1, $2, $3)', [
        accountB,
        'test@example.com',
        'User B',
      ]),
    ).rejects.toMatchObject({ code: '23505' });
  });
});
