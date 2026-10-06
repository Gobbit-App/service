import { validateCalcExpression } from '../schemas/calc-expression';
import { evaluate } from 'mathjs';

/** Result of evaluating a calc expression: either a finite number or an error. */
export type CalcResult = { ok: true; value: number } | { ok: false };

/** Evaluates a calc expression with the given field values. */
export function evaluateCalc(
  expression: string,
  values: Readonly<Record<string, number | undefined>>,
): CalcResult {
  // 1. Validate expression
  const validation = validateCalcExpression(expression, Object.keys(values));
  if (!validation.ok) {
    return { ok: false };
  }

  // 2. Check all values are defined and finite
  for (const value of Object.values(values)) {
    if (value === undefined || !Number.isFinite(value)) {
      return { ok: false };
    }
  }

  // 3. Evaluate with mathjs
  try {
    const scope = { ...values };
    const result = evaluate(expression, scope);

    if (typeof result === 'number' && Number.isFinite(result)) {
      return { ok: true, value: result };
    }
    return { ok: false };
  } catch {
    return { ok: false };
  }
}

/** Formats a calc result as a localized string with up to 4 decimal places. */
export function formatCalcResult(value: number, locale = 'en'): string {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 4,
  }).format(value);
}
