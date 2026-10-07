import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import type { CalcPayload } from './payload-guards';
import { evaluateCalc, formatCalcResult } from '@pb/shared/calc';

/** Calculator component for evaluating mathematical expressions. */
export function CalcCard({ payload }: { payload: CalcPayload }): ReactElement {
  const [raw, setRaw] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      payload.fields.map((field) => [
        field.key,
        field.default !== undefined ? String(field.default) : '',
      ]),
    ),
  );

  const resultText = useMemo(() => {
    const values: Record<string, number | undefined> = {};
    for (const key in raw) {
      const trimmed = raw[key].trim();
      values[key] = trimmed === '' ? undefined : Number(trimmed);
    }

    const result = evaluateCalc(payload.expression, values);
    return result.ok ? formatCalcResult(result.value) : '—';
  }, [payload, raw]);

  return (
    <div className="calc-card">
      {payload.fields.map((field) => (
        <label key={field.key} className="calc-card__field">
          <span className="calc-card__label" dir="auto">
            {field.label}
          </span>
          <input
            type="number"
            inputMode="decimal"
            step="any"
            value={raw[field.key]}
            onChange={(e) => setRaw({ ...raw, [field.key]: e.target.value })}
            className="calc-card__input"
          />
          {field.unit && <span className="calc-card__unit">{field.unit}</span>}
        </label>
      ))}
      <p className="calc-card__result">
        <span dir="auto">{payload.resultLabel}</span>
        <output aria-live="polite">{resultText}</output>
      </p>
    </div>
  );
}
