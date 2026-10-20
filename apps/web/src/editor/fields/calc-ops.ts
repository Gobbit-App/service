import { CALC_MAX_FIELDS } from '@pb/shared/card-limits';
import { parseCalcDefault, type CalcDraftField, type CalcDraftPayload } from '../draft';

/** Pure edits on a calc draft. Renaming a key never rewrites the expression. */

export const canAddField = (p: CalcDraftPayload): boolean => p.fields.length < CALC_MAX_FIELDS;
export const canRemoveField = (p: CalcDraftPayload): boolean => p.fields.length > 1;

/** The first free single letter (`a`…`z`), then `f1`, `f2`, … */
export function nextFieldKey(fields: readonly CalcDraftField[]): string {
  const used = new Set(fields.map((f) => f.key.trim()));
  for (let code = 97; code <= 122; code += 1) {
    const key = String.fromCharCode(code);
    if (!used.has(key)) return key;
  }
  let n = 1;
  while (used.has(`f${n}`)) n += 1;
  return `f${n}`;
}

export function addField(p: CalcDraftPayload): CalcDraftPayload {
  if (!canAddField(p)) return p;
  const field: CalcDraftField = { key: nextFieldKey(p.fields), label: '', unit: '', default: '' };
  return { ...p, fields: [...p.fields, field] };
}

export function removeField(p: CalcDraftPayload, index: number): CalcDraftPayload {
  if (!canRemoveField(p)) return p;
  return { ...p, fields: p.fields.filter((_, i) => i !== index) };
}

export function setField(
  p: CalcDraftPayload,
  index: number,
  changes: Partial<CalcDraftField>,
): CalcDraftPayload {
  return { ...p, fields: p.fields.map((f, i) => (i === index ? { ...f, ...changes } : f)) };
}

/**
 * Values for the live result: each field's default, `undefined` when empty or not a number
 * (so the result shows as unavailable instead of a wrong number).
 */
export function calcValues(p: CalcDraftPayload): Record<string, number | undefined> {
  const values: Record<string, number | undefined> = {};
  for (const field of p.fields) {
    const value = parseCalcDefault(field.default);
    values[field.key.trim()] = value !== undefined && Number.isFinite(value) ? value : undefined;
  }
  return values;
}
