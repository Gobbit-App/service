import { describe, it, expect } from 'vitest';
import { withTestDb } from './db-fixture';

/** D70: search_normalize() is the only normalization; the column and every query use it. */
describe('search_normalize', () => {
  const t = withTestDb();

  const norm = async (input: string | null): Promise<string | null> => {
    const res = await t.pool.query<{ n: string | null }>('SELECT search_normalize($1) AS n', [
      input,
    ]);
    return res.rows[0]!.n;
  };

  it.each([
    ['lowercases Latin', 'Dr. SMITH Dental', 'dr. smith dental'],
    ['strips Hebrew niqqud', 'רוֹפֵא שִׁנַּיִם', 'רופא שנים'],
    ['strips cantillation', 'בְּרֵאשִׁ֖ית', 'בראשית'],
    ['turns maqaf into a space', 'בית־ספר', 'בית ספר'],
    ['folds Greek tonos', 'οδοντίατρος', 'οδοντιατροσ'],
    ['folds Greek uppercase with tonos', 'ΟΔΟΝΤΊΑΤΡΟΣ', 'οδοντιατροσ'],
    ['folds dialytika', 'Ταΐζω προϋπόθεση', 'ταιζω προυποθεση'],
    ['folds final sigma', 'λόγος', 'λογοσ'],
    ['strips combining accents', 'café', 'cafe'],
    ['removes dashes and spaces between digits', '052-123 4567', '0521234567'],
    ['removes dots, slashes and parens between digits', '(03) 555.12/34', '(035551234'],
    ['keeps separators that are not between digits', 'call 052 - now', 'call 052 - now'],
    ['collapses whitespace', '  a \t\n b   c ', 'a b c'],
  ])('%s', async (_name, input, expected) => {
    expect(await norm(input)).toBe(expected);
  });

  it('is idempotent', async () => {
    const once = await norm('  Οδοντίατρος —  רוֹפֵא 052-123 4567 ');
    expect(await norm(once)).toBe(once);
  });

  it('returns null for null', async () => {
    expect(await norm(null)).toBeNull();
  });
});

describe('item_search_text', () => {
  const t = withTestDb();

  const text = async (type: string, payload: unknown): Promise<string> => {
    const res = await t.pool.query<{ s: string }>(
      'SELECT item_search_text($1::item_type, $2, $3, $4::jsonb) AS s',
      [type, 'Title', 'Body', JSON.stringify(payload)],
    );
    return res.rows[0]!.s;
  };

  it('includes title, body and payload string leaves', async () => {
    const s = await text('link', {
      url: 'https://example.com/x',
      preview: { title: 'Preview Title', description: 'Desc', image: null },
    });
    expect(s).toContain('title body');
    expect(s).toContain('https://example.com/x');
    expect(s).toContain('preview title');
    expect(s).toContain('desc');
  });

  it('excludes the image publicId but keeps alt', async () => {
    const s = await text('image', { publicId: 'secret-public-id', alt: 'Kitchen wall' });
    expect(s).not.toContain('secret-public-id');
    expect(s).toContain('kitchen wall');
  });

  it('excludes the calc expression but keeps labels', async () => {
    const s = await text('calc', {
      fields: [{ key: 'qty', label: 'Quantity', unit: 'kg', default: 1 }],
      expression: 'qty * zzprice',
      resultLabel: 'Total',
    });
    expect(s).not.toContain('zzprice');
    expect(s).toContain('quantity');
    expect(s).toContain('total');
  });

  it('includes table columns and cells', async () => {
    const s = await text('table', { columns: ['Day', 'Pickup'], rows: [['Friday', '12:30']] });
    expect(s).toContain('pickup');
    expect(s).toContain('friday');
  });

  it('feeds the generated items.search_text column', async () => {
    const res = await t.pool.query<{ ok: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM pg_attribute
         WHERE attrelid = 'items'::regclass AND attname = 'search_text' AND attgenerated = 's'
       ) AS ok`,
    );
    expect(res.rows[0]!.ok).toBe(true);
  });
});
