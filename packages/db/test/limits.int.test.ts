import { describe, it, expect, beforeAll } from 'vitest';
import { withTestDb } from './db-fixture';
import { accounts, users, decks, items } from '../src/schema';

const ctx = withTestDb();

describe('DB limits (constraint checks)', () => {
  const testAccountId = '550e8400-e29b-41d4-a716-446655440000';
  const testUserId = '550e8400-e29b-41d4-a716-446655440001';
  const testDeckId = '550e8400-e29b-41d4-a716-446655440002';

  beforeAll(async () => {
    // Setup: create account, deck, user
    await ctx.db.insert(accounts).values({
      id: testAccountId,
      name: 'Test Account',
    });
    await ctx.db.insert(decks).values({
      id: testDeckId,
      kind: 'personal',
      slug: 'test-limits',
      name: 'Test Limits',
      ownerAccountId: testAccountId,
    });
    await ctx.db.insert(users).values({
      id: testUserId,
      accountId: testAccountId,
      email: 'limits-test@example.com',
      displayName: 'Limits Test User',
    });
  });

  it('rejects item with body exceeding 2000 chars', async () => {
    const longBody = 'a'.repeat(2001);

    try {
      await ctx.db.insert(items).values({
        id: '550e8400-e29b-41d4-a716-446655440003',
        deckId: testDeckId,
        type: 'text',
        status: 'proposed',
        title: 't',
        body: longBody,
        payload: {},
        sourceKind: 'manual',
        createdBy: testUserId,
      });
      expect.fail('Should have rejected due to body length');
    } catch (err: any) {
      const code = err.code || err.cause?.code;
      expect(code).toBe('23514');
    }
  });

  it('accepts item with Unicode body of 2000 chars', async () => {
    const hebrewBody = 'א'.repeat(2000);

    await ctx.db.insert(items).values({
      id: '550e8400-e29b-41d4-a716-446655440004',
      deckId: testDeckId,
      type: 'text',
      status: 'proposed',
      title: 't',
      body: hebrewBody,
      payload: {},
      sourceKind: 'manual',
      createdBy: testUserId,
    });
  });

  it('rejects payload exceeding 9216 bytes', async () => {
    const largeString = 'x'.repeat(9300);
    const payload = { t: largeString };

    try {
      await ctx.db.insert(items).values({
        id: '550e8400-e29b-41d4-a716-446655440005',
        deckId: testDeckId,
        type: 'text',
        status: 'proposed',
        title: 't',
        body: '',
        payload,
        sourceKind: 'manual',
        createdBy: testUserId,
      });
      expect.fail('Should have rejected due to payload size');
    } catch (err: any) {
      const code = err.code || err.cause?.code;
      expect(code).toBe('23514');
    }
  });

  it('rejects payload that is an array (not an object)', async () => {
    try {
      await ctx.pool.query(
        `INSERT INTO items (id, deck_id, type, status, title, body, payload, source_kind, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)`,
        [
          '550e8400-e29b-41d4-a716-446655440006',
          testDeckId,
          'text',
          'published',
          't',
          '',
          '[]',
          'manual',
          testUserId,
        ],
      );
      expect.fail('Should have rejected array payload');
    } catch (err: any) {
      const code = err.code || err.cause?.code;
      expect(code).toBe('23514');
    }
  });

  it('rejects payload that is a string (not an object)', async () => {
    try {
      await ctx.pool.query(
        `INSERT INTO items (id, deck_id, type, status, title, body, payload, source_kind, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)`,
        [
          '550e8400-e29b-41d4-a716-446655440007',
          testDeckId,
          'text',
          'published',
          't',
          '',
          '"str"',
          'manual',
          testUserId,
        ],
      );
      expect.fail('Should have rejected string payload');
    } catch (err: any) {
      const code = err.code || err.cause?.code;
      expect(code).toBe('23514');
    }
  });
});

describe('items_cover_chk (D387/D389)', () => {
  const cctx = withTestDb();
  let deckId: string;

  const EVENT_PAYLOAD = {
    allDay: true,
    start: '2030-06-01',
    timeZone: 'UTC',
    notify: { before: [], audience: { mode: 'everyone', userIds: [] } },
  };

  // The items_reminder_reveal trigger derives reveal_at from these.
  const REMINDER_PAYLOAD = {
    deadline: '2030-06-01T00:00:00Z',
    showBefore: { amount: 1, unit: 'days' },
  };

  beforeAll(async () => {
    const account = await cctx.pool.query(`INSERT INTO accounts (name) VALUES ('T') RETURNING id`);
    const deck = await cctx.pool.query(
      `INSERT INTO decks (kind, slug, name, owner_account_id, is_public)
       VALUES ('shared', 'cover-chk', 'D', $1, false) RETURNING id`,
      [account.rows[0].id],
    );
    deckId = deck.rows[0].id;
  });

  /** Raw insert so the cover reaches the DB exactly as given (JSON text, any shape). */
  function insertCard(type: string, coverJson: string | null) {
    const payload = type === 'event' ? EVENT_PAYLOAD : type === 'reminder' ? REMINDER_PAYLOAD : {};
    return cctx.pool.query(
      `INSERT INTO items (deck_id, type, status, title, payload, cover)
       VALUES ($1, $2, 'proposed', 't', $3::jsonb, $4::jsonb)`,
      [deckId, type, JSON.stringify(payload), coverJson],
    );
  }

  const COVERS = [
    ['null', null],
    ['publicId only', JSON.stringify({ publicId: 'gobbit/items/x/a' })],
    [
      'publicId with dimensions',
      JSON.stringify({ publicId: 'gobbit/items/x/a', width: 640, height: 480 }),
    ],
  ] as const;

  for (const type of ['text', 'reminder', 'event', 'table', 'calc']) {
    for (const [label, cover] of COVERS) {
      it(`accepts ${label} on ${type}`, async () => {
        await expect(insertCard(type, cover)).resolves.toBeDefined();
      });
    }
  }

  for (const type of ['link', 'image']) {
    it(`accepts a null cover on ${type}`, async () => {
      await expect(insertCard(type, null)).resolves.toBeDefined();
    });
    it(`rejects a cover on ${type}`, async () => {
      await expect(insertCard(type, JSON.stringify({ publicId: 'a' }))).rejects.toThrow(
        /items_cover_chk/,
      );
    });
  }

  const BAD: Array<[string, string]> = [
    ['a JSON string', JSON.stringify('gobbit/items/x/a')],
    ['an array', JSON.stringify(['a'])],
    ['a missing publicId', JSON.stringify({ width: 1 })],
    ['a non-string publicId', JSON.stringify({ publicId: 5 })],
    ['an empty publicId', JSON.stringify({ publicId: '' })],
    ['a 256-char publicId', JSON.stringify({ publicId: 'a'.repeat(256) })],
    ['a string width', JSON.stringify({ publicId: 'a', width: '640' })],
  ];

  for (const [label, cover] of BAD) {
    it(`rejects ${label} on a text card`, async () => {
      await expect(insertCard('text', cover)).rejects.toThrow(/items_cover_chk/);
    });
  }

  it('accepts a 255-char publicId', async () => {
    await expect(
      insertCard('text', JSON.stringify({ publicId: 'a'.repeat(255) })),
    ).resolves.toBeDefined();
  });
});
