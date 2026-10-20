import type { ReactElement } from 'react';
import { evaluateCalc, formatCalcResult } from '@pb/shared/calc';
import { PAYLOAD_MAX_BYTES } from '@pb/shared/card-limits';
import type { CalcDraftField } from '../draft';
import {
  addField,
  calcValues,
  canAddField,
  canRemoveField,
  removeField,
  setField,
} from './calc-ops';
import { payloadBytes } from '../validate';
import { LimitMeter } from './LimitMeter';
import { TextInput } from './TextInput';
import type { FieldsProps } from './types';

/** The live result with every field's default; nothing to show until the inputs are complete. */
function LiveResult({ payload }: Pick<FieldsProps<'calc'>, 'payload'>): ReactElement {
  const values = calcValues(payload);
  const expression = payload.expression.trim();
  const result = expression ? evaluateCalc(expression, values) : { ok: false as const };
  return (
    <p className="calc-fields__result" aria-live="polite">
      {result.ok
        ? `${payload.resultLabel || 'Result'}: ${formatCalcResult(result.value)}`
        : 'Result: give every field a default to see it here.'}
    </p>
  );
}

/**
 * US4: field list, expression and result label (lazy; mathjs comes with `@pb/shared/calc`,
 * the same async chunk as `CalcCard`). The expression check itself runs in `validate.ts`.
 */
export function CalcFields({
  payload,
  onChange,
  errors,
  disabled,
}: FieldsProps<'calc'>): ReactElement {
  const edit = (index: number, changes: Partial<CalcDraftField>) =>
    onChange(setField(payload, index, changes));

  return (
    <div className="editor__fields">
      {payload.fields.map((field, i) => {
        const path = `payload.fields.${i}`;
        return (
          <fieldset key={i} className="calc-fields__field">
            <legend>Field {i + 1}</legend>
            <div className="calc-fields__row">
              <TextInput
                label="Key"
                value={field.key}
                onChange={(key) => edit(i, { key })}
                error={errors[`${path}.key`]}
                disabled={disabled}
              />
              <TextInput
                label="Label"
                value={field.label}
                onChange={(label) => edit(i, { label })}
                error={errors[`${path}.label`]}
                disabled={disabled}
              />
              <TextInput
                label="Unit"
                value={field.unit}
                onChange={(unit) => edit(i, { unit })}
                disabled={disabled}
              />
              <TextInput
                label="Default"
                value={field.default}
                onChange={(value) => edit(i, { default: value })}
                error={errors[`${path}.default`]}
                disabled={disabled}
              />
            </div>
            <button
              type="button"
              className="button button--ghost"
              aria-label={`Remove field ${i + 1}`}
              disabled={disabled || !canRemoveField(payload)}
              onClick={() => onChange(removeField(payload, i))}
            >
              Remove
            </button>
          </fieldset>
        );
      })}
      <button
        type="button"
        className="button button--ghost"
        disabled={disabled || !canAddField(payload)}
        onClick={() => onChange(addField(payload))}
      >
        Add field
      </button>
      {errors['payload.fields'] && <p className="field__error">{errors['payload.fields']}</p>}
      <TextInput
        label="Expression"
        value={payload.expression}
        onChange={(expression) => onChange({ ...payload, expression })}
        error={errors['payload.expression']}
        disabled={disabled}
        hint={
          <span className="muted">
            Use the keys with + - * / ^ and round, min, max, abs, floor, ceil.
          </span>
        }
      />
      <TextInput
        label="Result label"
        value={payload.resultLabel}
        onChange={(resultLabel) => onChange({ ...payload, resultLabel })}
        error={errors['payload.resultLabel']}
        disabled={disabled}
      />
      <LiveResult payload={payload} />
      <p className="muted">
        <LimitMeter
          used={payloadBytes({ type: 'calc', payload })}
          max={PAYLOAD_MAX_BYTES}
          unit="bytes"
        />
      </p>
    </div>
  );
}
