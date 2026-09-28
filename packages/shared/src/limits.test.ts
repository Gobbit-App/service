import { describe, it, expect } from 'vitest';
import {
  CARD_BODY_MAX,
  CALC_MAX_FIELDS,
  PAGE_LIMIT_DEFAULT,
  PAGE_LIMIT_MAX,
  PAYLOAD_DB_BACKSTOP_BYTES,
  PAYLOAD_MAX_BYTES,
  TABLE_MAX_COLUMNS,
  TABLE_MAX_ROWS,
} from './limits';

describe('limits', () => {
  it('CARD_BODY_MAX should be 600', () => {
    expect(CARD_BODY_MAX).toBe(600);
  });

  it('PAYLOAD_MAX_BYTES should be 8192', () => {
    expect(PAYLOAD_MAX_BYTES).toBe(8192);
  });

  it('PAYLOAD_DB_BACKSTOP_BYTES should be greater than PAYLOAD_MAX_BYTES', () => {
    expect(PAYLOAD_DB_BACKSTOP_BYTES).toBeGreaterThan(PAYLOAD_MAX_BYTES);
  });

  it('PAGE_LIMIT_DEFAULT should be less than or equal to PAGE_LIMIT_MAX', () => {
    expect(PAGE_LIMIT_DEFAULT).toBeLessThanOrEqual(PAGE_LIMIT_MAX);
  });

  it('TABLE_MAX_ROWS should be 12', () => {
    expect(TABLE_MAX_ROWS).toBe(12);
  });

  it('TABLE_MAX_COLUMNS should be 6', () => {
    expect(TABLE_MAX_COLUMNS).toBe(6);
  });

  it('CALC_MAX_FIELDS should be 6', () => {
    expect(CALC_MAX_FIELDS).toBe(6);
  });
});
