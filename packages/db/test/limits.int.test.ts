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

  it('rejects item with body exceeding 600 chars', async () => {
    const longBody = 'a'.repeat(601);

    try {
      await ctx.db.insert(items).values({
        id: '550e8400-e29b-41d4-a716-446655440003',
        deckId: testDeckId,
        type: 'text',
        status: 'published',
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

  it('accepts item with Unicode body of 600 chars', async () => {
    const hebrewBody = 'א'.repeat(600);

    await ctx.db.insert(items).values({
      id: '550e8400-e29b-41d4-a716-446655440004',
      deckId: testDeckId,
      type: 'text',
      status: 'published',
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
        status: 'published',
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
