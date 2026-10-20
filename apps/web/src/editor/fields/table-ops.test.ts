import { describe, expect, it } from 'vitest';
import type { TablePayload } from '../../cards/payload-guards';
import {
  addColumn,
  addRow,
  canAddColumn,
  canAddRow,
  moveColumn,
  moveRow,
  removeColumn,
  removeRow,
  setCell,
  setHeading,
} from './table-ops';

const t: TablePayload = {
  columns: ['A', 'B'],
  rows: [
    ['1', '2'],
    ['3', '4'],
  ],
};

const aligned = (p: TablePayload) => p.rows.every((r) => r.length === p.columns.length);

describe('rows', () => {
  it('adds an empty row aligned with the columns', () => {
    expect(addRow(t).rows.at(-1)).toEqual(['', '']);
  });

  it('stops at 12 rows', () => {
    const full: TablePayload = { columns: ['A'], rows: Array.from({ length: 12 }, () => ['x']) };
    expect(canAddRow(full)).toBe(false);
    expect(addRow(full)).toBe(full);
  });

  it('removes a row', () => {
    expect(removeRow(t, 0).rows).toEqual([['3', '4']]);
  });

  it('moves a row up and down and ignores moves past the edges', () => {
    expect(moveRow(t, 1, -1).rows).toEqual([
      ['3', '4'],
      ['1', '2'],
    ]);
    expect(moveRow(t, 0, 1).rows[0]).toEqual(['3', '4']);
    expect(moveRow(t, 0, -1).rows).toEqual(t.rows);
    expect(moveRow(t, 1, 1).rows).toEqual(t.rows);
  });
});

describe('columns', () => {
  it('adds a column and a cell in every row', () => {
    const next = addColumn(t);
    expect(next.columns).toEqual(['A', 'B', '']);
    expect(aligned(next)).toBe(true);
  });

  it('stops at 6 columns', () => {
    const full: TablePayload = { columns: ['1', '2', '3', '4', '5', '6'], rows: [] };
    expect(canAddColumn(full)).toBe(false);
    expect(addColumn(full)).toBe(full);
  });

  it('removes a column with its cells and keeps the last one', () => {
    const next = removeColumn(t, 0);
    expect(next).toEqual({ columns: ['B'], rows: [['2'], ['4']] });
    expect(removeColumn(next, 0)).toBe(next);
  });

  it('moves a column with its cells', () => {
    expect(moveColumn(t, 0, 1)).toEqual({
      columns: ['B', 'A'],
      rows: [
        ['2', '1'],
        ['4', '3'],
      ],
    });
    expect(moveColumn(t, 1, 1)).toEqual(t);
  });
});

describe('cells', () => {
  it('sets a heading and a cell without touching the rest', () => {
    expect(setHeading(t, 1, 'Z').columns).toEqual(['A', 'Z']);
    expect(setCell(t, 1, 0, 'x').rows).toEqual([
      ['1', '2'],
      ['x', '4'],
    ]);
    expect(t.rows[1]).toEqual(['3', '4']);
  });
});
