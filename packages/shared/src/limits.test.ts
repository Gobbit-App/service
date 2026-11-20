import { describe, it, expect } from 'vitest';
import {
  ingestChannels,
  IMPORT_DAILY_CAP_DEFAULT,
  IMPORT_DISCARD_MAX,
  IMPORT_ROWS_PER_PREVIEW,
  IMPORT_ROWS_PER_REQUEST,
  IMPORT_UNMATCHED_MAX,
} from './ingest/constants';
import {
  ingestDailyCaps,
  INGEST_CHANNEL_DAILY_CAPS,
  CARD_BODY_MAX,
  CALC_MAX_FIELDS,
  PAGE_LIMIT_DEFAULT,
  PAGE_LIMIT_MAX,
  PAYLOAD_DB_BACKSTOP_BYTES,
  PAYLOAD_MAX_BYTES,
  TABLE_MAX_COLUMNS,
  TABLE_MAX_ROWS,
  WAITLIST_JOIN_PER_EMAIL_PER_HOUR,
  WAITLIST_JOIN_PER_IP_PER_HOUR,
} from './limits';

describe('limits', () => {
  it('waitlist join limits default to 10 per IP and 3 per email per hour (D219)', () => {
    expect(WAITLIST_JOIN_PER_IP_PER_HOUR).toBe(10);
    expect(WAITLIST_JOIN_PER_EMAIL_PER_HOUR).toBe(3);
  });

  it('CARD_BODY_MAX should be 2000', () => {
    expect(CARD_BODY_MAX).toBe(2000);
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

describe('ingestDailyCaps (D110)', () => {
  it('gives every channel its override or the default cap', () => {
    const caps = ingestDailyCaps(7);
    expect(Object.keys(caps).sort()).toEqual([...ingestChannels].sort());
    for (const channel of ingestChannels) {
      expect(caps[channel]).toBe(INGEST_CHANNEL_DAILY_CAPS[channel] ?? 7);
    }
  });

  it('caps imported rows at 500 a day whatever the default (D190)', () => {
    expect(ingestDailyCaps(7).import).toBe(500);
    expect(ingestDailyCaps(7).paste).toBe(7);
  });

  it('import values (D447): cap 500, preview = cap, request 100, discard 1000, unmatched 5', () => {
    expect(IMPORT_DAILY_CAP_DEFAULT).toBe(500);
    expect(INGEST_CHANNEL_DAILY_CAPS.import).toBe(IMPORT_DAILY_CAP_DEFAULT);
    expect(IMPORT_ROWS_PER_PREVIEW).toBe(IMPORT_DAILY_CAP_DEFAULT);
    expect(IMPORT_ROWS_PER_REQUEST).toBe(100);
    expect(IMPORT_DISCARD_MAX).toBe(1000);
    expect(IMPORT_UNMATCHED_MAX).toBe(5);
  });
});
