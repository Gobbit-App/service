import { describe, expect, it } from 'vitest';
import type { ImportRow } from './constants';
import { toImportDraft, type ImportCategory } from './to-draft';

describe('toImportDraft section rows', () => {
  it('passes title and a multi-paragraph body through verbatim', () => {
    const body = 'פסקה ראשונה עם **הדגשה**\n\n\n- פריט אחד\n- פריט שני\n\n  פסקה   אחרונה  \n';
    const row = {
      line: 3,
      type: 'text',
      title: 'בריאות',
      body,
      sourceUrl: null,
      categories: [],
      cover: null,
      image: null,
    } as unknown as ImportRow;
    const draft = toImportDraft(row, []);
    expect(draft.title).toBe('בריאות');
    expect(draft.body).toBe(body);
  });
});

const mk = (categories: string[], extra: Partial<ImportRow> = {}): ImportRow =>
  ({
    line: 1,
    type: 'text',
    title: 'T',
    body: 'b',
    sourceUrl: null,
    categories,
    cover: null,
    image: null,
    ...extra,
  }) as unknown as ImportRow;

const cats: ImportCategory[] = [
  { id: 'c1', name: 'Health', slug: 'health' },
  { id: 'c2', name: 'Travel', slug: 'travel' },
  { id: 'c3', name: 'בריאות', slug: 'בריאות' },
];

describe('toImportDraft categories (US2)', () => {
  it('maps several names to several ids', () => {
    expect(toImportDraft(mk(['Health', 'travel']), cats, { strict: false }).categoryIds).toEqual([
      'c1',
      'c2',
    ]);
  });

  it('drops repeats (name and slug of one category give one id)', () => {
    const d = toImportDraft(mk(['Health', 'health']), cats, { strict: false });
    expect(d.categoryIds).toEqual(['c1']);
  });

  it('keeps a link row as a link with its sourceUrl', () => {
    const d = toImportDraft(
      mk(['Health'], { type: 'link', sourceUrl: 'https://example.com/a' }),
      cats,
      { strict: false },
    );
    expect(d.type).toBe('link');
    expect(d.sourceUrl).toBe('https://example.com/a');
  });

  it('puts unmatched names in unmatched; absent or empty when none', () => {
    const d = toImportDraft(mk(['Health', 'Nope', 'Zip']), cats, { strict: false });
    expect(d.categoryIds).toEqual(['c1']);
    expect(d.unmatched).toEqual(['Nope', 'Zip']);
    expect(toImportDraft(mk(['Health']), cats, { strict: false }).unmatched ?? []).toEqual([]);
  });
});

describe('toImportDraft strict and newCategory (T030/T035)', () => {
  it('strict: always a draft, unmatched carried, no newCategory', () => {
    const d = toImportDraft(mk(['Health', 'Nope']), cats, { strict: true });
    expect(d.title).toBe('T');
    expect(d.categoryIds).toEqual(['c1']);
    expect(d.unmatched).toEqual(['Nope']);
    expect(d.newCategory).toBeUndefined();
  });

  it('non-strict with exactly one unmatched: newCategory, unmatched empty', () => {
    const d = toImportDraft(mk(['Health', ' Nope ']), cats, { strict: false });
    expect(d.newCategory).toBe('Nope');
    expect(d.unmatched ?? []).toEqual([]);
  });

  it('non-strict with several unmatched: names stay in unmatched, no newCategory', () => {
    const d = toImportDraft(mk(['A', 'B']), cats, { strict: false });
    expect(d.unmatched).toEqual(['A', 'B']);
    expect(d.newCategory).toBeUndefined();
  });

  it('matches a category address in another script', () => {
    const d = toImportDraft(mk(['בריאות']), cats, { strict: true });
    expect(d.categoryIds).toEqual(['c3']);
    expect(d.unmatched ?? []).toEqual([]);
  });

  it('matches the same name in NFD and NFC', () => {
    const nfc = [{ id: 'c9', name: 'Café', slug: 'cafe' }];
    const d = toImportDraft(mk(['Cafe\u0301']), nfc, { strict: true });
    expect(d.categoryIds).toEqual(['c9']);
  });
});
