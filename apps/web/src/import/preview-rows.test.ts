import { describe, expect, it } from 'vitest';
import { CARD_BODY_MAX } from '@pb/shared/card-limits';
import type { ImportRow } from '@pb/shared/import';
import {
  categoryStatus,
  editRow,
  importableRows,
  previewRows,
  rowsToDrafts,
  toggleRow,
} from './preview-rows';

const row = (overrides: Partial<ImportRow> = {}): ImportRow => ({
  line: 1,
  type: 'text',
  title: 'Clinic',
  body: '',
  sourceUrl: null,
  category: null,
  error: null,
  ...overrides,
});

const health = { id: '5f2b8a4e-1c0d-4d8e-9a6b-2f1e3c4d5a6b', name: 'Health', slug: 'health' };

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

  it('clears an emptied category', () => {
    const [withCategory] = previewRows([row({ category: 'Health' })]);
    expect(editRow(withCategory!, { category: '  ' }).category).toBeNull();
  });

  it('sends an existing category by id and a new one by name', () => {
    const drafts = rowsToDrafts(
      previewRows([row({ category: 'health' }), row({ category: 'Schools' })]),
      [health],
    );
    expect(drafts[0]).toMatchObject({ categoryIds: [health.id] });
    expect(drafts[1]).toMatchObject({ newCategory: 'Schools' });
    expect(categoryStatus('Health', [health])).toBe('existing');
    expect(categoryStatus('Schools', [health])).toBe('new');
    expect(categoryStatus(null, [health])).toBeNull();
  });
});
