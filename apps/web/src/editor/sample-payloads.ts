import type { TablePayload } from '../cards/payload-guards';
import type { CalcDraftPayload } from './draft';

/**
 * D270: a new table or calc card starts from a small sample that teaches the format; Clear
 * (`clearTable` / `clearCalc`) goes back to the blank structure below. Fresh objects every call,
 * so a draft never shares arrays with another.
 */

export function sampleTable(): TablePayload {
  return {
    columns: ['Item', 'Qty'],
    rows: [
      ['Milk', '2'],
      ['Bread', '1'],
    ],
  };
}

/** Two columns, one row, all empty: the smallest table worth typing into. */
export function blankTable(): TablePayload {
  return { columns: ['', ''], rows: [['', '']] };
}

/** Computes live: `price * qty` with the defaults gives "Total: 30". */
export function sampleCalc(): CalcDraftPayload {
  return {
    fields: [
      { key: 'price', label: 'Price', unit: '', default: '10' },
      { key: 'qty', label: 'Quantity', unit: '', default: '3' },
    ],
    expression: 'price * qty',
    resultLabel: 'Total',
  };
}

/** One field with the first free key, no expression. */
export function blankCalc(): CalcDraftPayload {
  return {
    fields: [{ key: 'a', label: '', unit: '', default: '' }],
    expression: '',
    resultLabel: '',
  };
}
