import { describe, expect, it } from 'vitest';
import { evaluateCalc } from '@gobbit/shared/calc';
import { calcPayloadSchema, tablePayloadSchema } from '@gobbit/shared';
import { PAYLOAD_MAX_BYTES } from '@gobbit/shared/card-limits';
import { calcValues } from './fields/calc-ops';
import { toPayload } from './draft';
import { payloadBytes } from './validate';
import { blankCalc, blankTable, sampleCalc, sampleTable } from './sample-payloads';

describe('sample payloads (D270)', () => {
  it('the table sample is a valid table within the limits', () => {
    const table = sampleTable();
    expect(tablePayloadSchema.safeParse(table).success).toBe(true);
    expect(payloadBytes({ type: 'table', payload: table })).toBeLessThan(PAYLOAD_MAX_BYTES);
  });

  it('the calc sample saves as a valid calc and computes live', () => {
    const calc = sampleCalc();
    expect(calcPayloadSchema.safeParse(toPayload({ type: 'calc', payload: calc })).success).toBe(
      true,
    );
    expect(evaluateCalc(calc.expression, calcValues(calc))).toEqual({ ok: true, value: 30 });
  });

  it('blank structures are two empty columns with one row, and one blank calc field', () => {
    expect(blankTable()).toEqual({ columns: ['', ''], rows: [['', '']] });
    expect(blankCalc()).toEqual({
      fields: [{ key: 'a', label: '', unit: '', default: '' }],
      expression: '',
      resultLabel: '',
    });
  });

  it('returns a fresh object every call', () => {
    expect(sampleTable()).not.toBe(sampleTable());
    expect(sampleTable().rows[0]).not.toBe(sampleTable().rows[0]);
    expect(sampleCalc().fields).not.toBe(sampleCalc().fields);
  });
});
