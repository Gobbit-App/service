import { describe, expect, it } from 'vitest';
import { CARD_BODY_MAX } from '@gobbit/shared/card-limits';
import { IMPORT_ROWS_PER_PREVIEW } from '@gobbit/shared/ingest-constants';
import { parseNotes, type ImportRow } from '@gobbit/shared/import';
import {
  categoryStatus,
  editRow,
  importableRows,
  previewRows,
  rowsToDrafts,
  tooManyRows,
  toggleRow,
} from './preview-rows';

const row = (overrides: Partial<ImportRow> = {}): ImportRow => ({
  line: 1,
  type: 'text',
  title: 'Clinic',
  body: '',
  sourceUrl: null,
  categories: [],
  cover: null,
  image: null,
  error: null,
  ...overrides,
});

const health = { id: '5f2b8a4e-1c0d-4d8e-9a6b-2f1e3c4d5a6b', name: 'Health', slug: 'health' };

describe('preview limit follows the cap', () => {
  it('previews 500 rows and asks to split at 501', () => {
    expect(IMPORT_ROWS_PER_PREVIEW).toBe(500);
    expect(tooManyRows(500)).toBe(false);
    expect(tooManyRows(501)).toBe(true);
  });
});

describe('preview rows (D189)', () => {
  it('ticks valid rows and leaves invalid ones unticked', () => {
    const rows = previewRows([row(), row({ line: 2, error: 'Too long' })]);
    expect(rows.map((r) => r.included)).toEqual([true, false]);
    expect(importableRows(rows)).toHaveLength(1);
  });

  it('does not tick an invalid row', () => {
    const [invalid] = previewRows([row({ error: 'No title', title: '' })]);
    expect(toggleRow(invalid!).included).toBe(false);
  });

  it('re-checks limits on edit: breaking a row unticks it, fixing it ticks it', () => {
    const [valid] = previewRows([row()]);
    const broken = editRow(valid!, { body: 'x'.repeat(CARD_BODY_MAX + 1) });
    expect(broken.error).toMatch(/Longer than/);
    expect(broken.included).toBe(false);

    const fixed = editRow(broken, { body: 'short' });
    expect(fixed).toMatchObject({ error: null, included: true });
  });

  it('keeps an unticked row unticked when it is edited', () => {
    const [valid] = previewRows([row()]);
    expect(editRow(toggleRow(valid!), { title: 'Dentist' }).included).toBe(false);
  });

  it('edits only the first category and keeps the rest', () => {
    const [two] = previewRows([row({ categories: ['Health', 'City'] })]);
    expect(editRow(two!, { category: 'Care' }).categories).toEqual(['Care', 'City']);
  });

  it('clears an emptied category', () => {
    const [withCategory] = previewRows([row({ categories: ['Health'] })]);
    expect(editRow(withCategory!, { category: '  ' }).categories).toEqual([]);
  });

  it('sends an existing category by id and a new one by name', () => {
    const drafts = rowsToDrafts(
      previewRows([row({ categories: ['health'] }), row({ categories: ['Schools'] })]),
      [health],
    );
    expect(drafts[0]).toMatchObject({ categoryIds: [health.id] });
    expect(drafts[1]).toMatchObject({ newCategory: 'Schools' });
    expect(categoryStatus('Health', [health])).toBe('existing');
    expect(categoryStatus('Schools', [health])).toBe('new');
    expect(categoryStatus(null, [health])).toBeNull();
  });

  it('maps a card-per-section file to one ticked row per ## section (049)', () => {
    const { rows } = parseNotes(
      '# Health\n\n## Clinic\nOpen 9-5\n\n## Dentist\nCall first\n',
      'markdown',
    );
    const preview = previewRows(rows);
    expect(preview.map((r) => [r.title, r.body, r.categories, r.included])).toEqual([
      ['Clinic', 'Open 9-5', ['Health'], true],
      ['Dentist', 'Call first', ['Health'], true],
    ]);
  });
});
