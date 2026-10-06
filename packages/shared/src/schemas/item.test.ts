import { describe, it, expect } from 'vitest';
import { itemCreateSchema, itemPatchSchema, itemListQuerySchema } from './item';
import { TABLE_MAX_ROWS, TABLE_MAX_COLUMNS } from '../limits';
import { codePointLength } from '../utils/utf8-bytes';

describe('itemCreateSchema', () => {
  it('text item {type:"text", title:"Hi"} parses with body="" and payload={}', () => {
    const result = itemCreateSchema.parse({
      type: 'text',
      title: 'Hi',
    });
    expect(result.type).toBe('text');
    expect(result.title).toBe('Hi');
    expect(result.body).toBe('');
    expect(result.payload).toEqual({});
  });

  it('body of 600 ASCII chars ok', () => {
    const body = 'a'.repeat(600);
    expect(codePointLength(body)).toBe(600);
    const result = itemCreateSchema.parse({
      type: 'text',
      title: 'Title',
      body,
    });
    expect(result.body).toBe(body);
  });

  it('body of 601 ASCII chars rejected with issue path [body]', () => {
    const body = 'a'.repeat(601);
    const result = itemCreateSchema.safeParse({
      type: 'text',
      title: 'Title',
      body,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const bodyError = result.error.issues.find((i) => JSON.stringify(i.path) === '["body"]');
      expect(bodyError).toBeDefined();
    }
  });

  it('600 Hebrew chars ok', () => {
    const body = 'א'.repeat(600);
    expect(codePointLength(body)).toBe(600);
    const result = itemCreateSchema.parse({
      type: 'text',
      title: 'Title',
      body,
    });
    expect(result.body).toBe(body);
  });

  it('599 a + one emoji (600 code points) ok', () => {
    const body = 'a'.repeat(599) + '👍';
    expect(codePointLength(body)).toBe(600);
    const result = itemCreateSchema.parse({
      type: 'text',
      title: 'Title',
      body,
    });
    expect(result.body).toBe(body);
  });

  it('title 121 chars rejected', () => {
    const title = 'a'.repeat(121);
    const result = itemCreateSchema.safeParse({
      type: 'text',
      title,
    });
    expect(result.success).toBe(false);
  });

  it('unknown type rejected', () => {
    const result = itemCreateSchema.safeParse({
      type: 'unknown',
      title: 'Title',
    } as unknown);
    expect(result.success).toBe(false);
  });

  it('table payload on a link item rejected', () => {
    const result = itemCreateSchema.safeParse({
      type: 'link',
      title: 'Title',
      payload: {
        columns: ['a'],
        rows: [['1']],
      },
    } as unknown);
    expect(result.success).toBe(false);
  });

  it('oversize text payload: table item 12 rows × 6 columns of ש.repeat(60) rejected with issue path [payload]', () => {
    const cellContent = 'ש'.repeat(60);
    const rows = Array(TABLE_MAX_ROWS)
      .fill(null)
      .map(() => Array(TABLE_MAX_COLUMNS).fill(cellContent));
    const result = itemCreateSchema.safeParse({
      type: 'table',
      title: 'Title',
      payload: {
        columns: Array(TABLE_MAX_COLUMNS)
          .fill(null)
          .map((_, i) => `Col${i}`),
        rows,
      },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const payloadError = result.error.issues.find(
        (i) => JSON.stringify(i.path) === '["payload"]',
      );
      expect(payloadError).toBeDefined();
    }
  });

  it('duplicate categoryIds rejected', () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    const result = itemCreateSchema.safeParse({
      type: 'text',
      title: 'Title',
      categoryIds: [id, id],
    });
    expect(result.success).toBe(false);
  });

  it("sourceUrl 'javascript:x' rejected", () => {
    const result = itemCreateSchema.safeParse({
      type: 'text',
      title: 'Title',
      sourceUrl: 'javascript:x',
    });
    expect(result.success).toBe(false);
  });
});

describe('itemPatchSchema', () => {
  it("{type:'link'} rejected (strict, D12)", () => {
    const result = itemPatchSchema.safeParse({
      type: 'link',
    });
    expect(result.success).toBe(false);
  });

  it('{} rejected', () => {
    const result = itemPatchSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("{title:'x'} ok", () => {
    const result = itemPatchSchema.safeParse({
      title: 'x',
    });
    expect(result.success).toBe(true);
  });

  it('{sourceUrl:null} ok', () => {
    const result = itemPatchSchema.safeParse({
      sourceUrl: null,
    });
    expect(result.success).toBe(true);
  });
});

describe('itemListQuerySchema', () => {
  it('{} → status "published", limit 20', () => {
    const result = itemListQuerySchema.parse({});
    expect(result.status).toBe('published');
    expect(result.limit).toBe(20);
  });

  it("{limit:'51'} rejected", () => {
    const result = itemListQuerySchema.safeParse({
      limit: '51',
    });
    expect(result.success).toBe(false);
  });

  it("{category:'food', type:'table'} ok", () => {
    const result = itemListQuerySchema.safeParse({
      category: 'food',
      type: 'table',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.category).toBe('food');
      expect(result.data.type).toBe('table');
    }
  });

  it("{favorite:'true'} ok; omitted stays undefined", () => {
    expect(itemListQuerySchema.parse({ favorite: 'true' }).favorite).toBe('true');
    expect(itemListQuerySchema.parse({}).favorite).toBeUndefined();
  });

  it.each(['false', '1', 'yes', ''])('{favorite:%j} rejected', (favorite) => {
    expect(itemListQuerySchema.safeParse({ favorite }).success).toBe(false);
  });
});
