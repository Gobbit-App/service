import { describe, it, expect } from 'vitest';
import { evaluateCalc, formatCalcResult } from './evaluate';

describe('evaluateCalc', () => {
  it('evaluates simple multiplication', () => {
    const result = evaluateCalc('a * b', { a: 2, b: 3 });
    expect(result).toEqual({ ok: true, value: 6 });
  });

  it('evaluates round function with division', () => {
    const result = evaluateCalc('round(a / b, 2)', { a: 10, b: 3 });
    expect(result).toEqual({ ok: true, value: 3.33 });
  });

  it('evaluates max and min functions', () => {
    const result = evaluateCalc('max(a, b) - min(a, b)', { a: 2, b: 7 });
    expect(result).toEqual({ ok: true, value: 5 });
  });

  it('evaluates exponentiation', () => {
    const result = evaluateCalc('a ^ 2', { a: 3 });
    expect(result).toEqual({ ok: true, value: 9 });
  });

  it('returns not ok for missing value', () => {
    const result = evaluateCalc('a * b', { a: 2 });
    expect(result).toEqual({ ok: false });
  });

  it('returns not ok for NaN value', () => {
    const result = evaluateCalc('a + b', { a: NaN, b: 1 });
    expect(result).toEqual({ ok: false });
  });

  it('returns not ok for Infinity value', () => {
    const result = evaluateCalc('a + b', { a: Infinity, b: 1 });
    expect(result).toEqual({ ok: false });
  });

  it('returns not ok for unknown symbol', () => {
    const result = evaluateCalc('a + c', { a: 1 });
    expect(result).toEqual({ ok: false });
  });

  it('returns not ok for division by zero', () => {
    const result = evaluateCalc('a / b', { a: 1, b: 0 });
    expect(result).toEqual({ ok: false });
  });

  it('returns not ok for disallowed function', () => {
    const result = evaluateCalc('sqrt(a)', { a: 4 });
    expect(result).toEqual({ ok: false });
  });

  it('returns not ok for syntax garbage', () => {
    const result = evaluateCalc('a +* b', { a: 1, b: 2 });
    expect(result).toEqual({ ok: false });
  });

  it('never throws for malformed syntax', () => {
    expect(() => {
      evaluateCalc(')(', {});
    }).not.toThrow();
    const result = evaluateCalc(')(', {});
    expect(result).toEqual({ ok: false });
  });
});

describe('formatCalcResult', () => {
  it('formats large number with thousands separator', () => {
    expect(formatCalcResult(1234.56789)).toBe('1,234.5679');
  });

  it('formats small integer without decimal places', () => {
    expect(formatCalcResult(2)).toBe('2');
  });

  it('formats decimal with different locale', () => {
    expect(formatCalcResult(0.5, 'he')).toBe('0.5');
  });
});
