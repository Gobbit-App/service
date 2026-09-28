import { describe, it, expect } from 'vitest';
import { validateCalcExpression } from './calc-expression';

describe('validateCalcExpression', () => {
  const fields = ['price', 'qty'] as const;

  describe('valid expressions', () => {
    const validCases = [
      'price * qty',
      'round(price * qty * 1.17, 2)',
      'max(price, 0) - abs(qty)',
      '(price + 1) / qty',
      '-price ^ 2 % 3',
    ];

    validCases.forEach((expr) => {
      it(`accepts: ${expr}`, () => {
        const result = validateCalcExpression(expr, fields);
        expect(result.ok).toBe(true);
      });
    });
  });

  describe('unknown symbol', () => {
    it('rejects unknown symbol "tax"', () => {
      const result = validateCalcExpression('price * tax', fields);
      expect(result.ok).toBe(false);
      expect((result as { message?: string }).message).toContain('Unknown symbol "tax"');
    });
  });

  describe('not allowed functions', () => {
    const notAllowedCases = ['import("fs")', 'evaluate("1+1")', 'sqrt(price)'];

    notAllowedCases.forEach((expr) => {
      it(`rejects: ${expr}`, () => {
        const result = validateCalcExpression(expr, fields);
        expect(result.ok).toBe(false);
        expect((result as { message?: string }).message).toContain('is not allowed');
      });
    });
  });

  describe('syntax errors', () => {
    it('rejects incomplete expression: price *', () => {
      const result = validateCalcExpression('price *', fields);
      expect(result.ok).toBe(false);
      expect((result as { message?: string }).message).toMatch(/^Invalid expression:/);
    });
  });

  describe('unsupported syntax', () => {
    const unsupportedCases = ['price = 3', 'x => x', '"text"', 'price[1]'];

    unsupportedCases.forEach((expr) => {
      it(`rejects: ${expr}`, () => {
        const result = validateCalcExpression(expr, fields);
        expect(result.ok).toBe(false);
      });
    });
  });
});
