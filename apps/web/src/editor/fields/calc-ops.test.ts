import { describe, expect, it } from 'vitest';
import type { CalcDraftField, CalcDraftPayload } from '../draft';
import { addField, calcValues, canAddField, nextFieldKey, removeField, setField } from './calc-ops';

const field = (key: string, extra: Partial<CalcDraftField> = {}): CalcDraftField => ({
  key,
  label: key.toUpperCase(),
  unit: '',
  default: '',
  ...extra,
});

const calc = (fields: CalcDraftField[], expression = 'a'): CalcDraftPayload => ({
  fields,
  expression,
  resultLabel: 'R',
});

describe('addField / removeField', () => {
  it('adds a field with the next free key', () => {
    const next = addField(calc([field('a')]));
    expect(next.fields.map((f) => f.key)).toEqual(['a', 'b']);
    expect(next.fields[1]).toEqual({ key: 'b', label: '', unit: '', default: '' });
  });

  it('allows at most 6 fields', () => {
    const six = calc(['a', 'b', 'c', 'd', 'e', 'f'].map((k) => field(k)));
    expect(canAddField(six)).toBe(false);
    expect(addField(six)).toBe(six);
  });

  it('removes a field but keeps the last one', () => {
    const two = calc([field('a'), field('b')]);
    expect(removeField(two, 0).fields.map((f) => f.key)).toEqual(['b']);
    const one = removeField(two, 0);
    expect(removeField(one, 0)).toBe(one);
  });
});

describe('nextFieldKey', () => {
  it('fills gaps and falls back to f1, f2 after z', () => {
    expect(nextFieldKey([field('a'), field('c')])).toBe('b');
    const letters = Array.from({ length: 26 }, (_, i) => field(String.fromCharCode(97 + i)));
    expect(nextFieldKey(letters)).toBe('f1');
    expect(nextFieldKey([...letters, field('f1')])).toBe('f2');
  });
});

describe('setField', () => {
  it('renames a key without touching the expression or other fields', () => {
    const before = calc([field('a'), field('b')], 'a * b');
    const after = setField(before, 0, { key: 'x' });
    expect(after.fields.map((f) => f.key)).toEqual(['x', 'b']);
    expect(after.expression).toBe('a * b');
    expect(before.fields[0]!.key).toBe('a');
  });
});

describe('calcValues', () => {
  it('parses defaults and leaves empty or invalid ones undefined', () => {
    const p = calc([
      field('a', { default: '2.5' }),
      field('b', { default: '' }),
      field('c', { default: 'x' }),
    ]);
    expect(calcValues(p)).toEqual({ a: 2.5, b: undefined, c: undefined });
  });
});
