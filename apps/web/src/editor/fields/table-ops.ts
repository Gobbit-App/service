import { TABLE_MAX_COLUMNS, TABLE_MAX_ROWS } from '@gobbit/shared/card-limits';
import type { TablePayload } from '../../cards/payload-guards';

/** Pure edits on a table payload; rows always stay aligned with the columns. */

export type Direction = -1 | 1;

export const canAddRow = (t: TablePayload): boolean => t.rows.length < TABLE_MAX_ROWS;
export const canAddColumn = (t: TablePayload): boolean => t.columns.length < TABLE_MAX_COLUMNS;
export const canRemoveColumn = (t: TablePayload): boolean => t.columns.length > 1;

function move<T>(list: readonly T[], index: number, direction: Direction): T[] {
  const target = index + direction;
  if (index < 0 || index >= list.length || target < 0 || target >= list.length) return [...list];
  const next = [...list];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

export function addRow(t: TablePayload): TablePayload {
  if (!canAddRow(t)) return t;
  return { ...t, rows: [...t.rows, t.columns.map(() => '')] };
}

export function removeRow(t: TablePayload, index: number): TablePayload {
  return { ...t, rows: t.rows.filter((_, i) => i !== index) };
}

export function moveRow(t: TablePayload, index: number, direction: Direction): TablePayload {
  return { ...t, rows: move(t.rows, index, direction) };
}

export function addColumn(t: TablePayload): TablePayload {
  if (!canAddColumn(t)) return t;
  return { columns: [...t.columns, ''], rows: t.rows.map((row) => [...row, '']) };
}

export function removeColumn(t: TablePayload, index: number): TablePayload {
  if (!canRemoveColumn(t)) return t;
  const drop = <T>(list: readonly T[]) => list.filter((_, i) => i !== index);
  return { columns: drop(t.columns), rows: t.rows.map(drop) };
}

export function moveColumn(t: TablePayload, index: number, direction: Direction): TablePayload {
  return {
    columns: move(t.columns, index, direction),
    rows: t.rows.map((row) => move(row, index, direction)),
  };
}

export function setHeading(t: TablePayload, index: number, value: string): TablePayload {
  return { ...t, columns: t.columns.map((c, i) => (i === index ? value : c)) };
}

export function setCell(t: TablePayload, row: number, column: number, value: string): TablePayload {
  return {
    ...t,
    rows: t.rows.map((r, i) => (i === row ? r.map((c, j) => (j === column ? value : c)) : r)),
  };
}
