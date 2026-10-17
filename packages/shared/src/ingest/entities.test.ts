import { describe, expect, it } from 'vitest';
import {
  compactEntities,
  ENTITIES_MAX_BYTES,
  ENTITY_VALUE_MAX,
  ENTITY_VALUES_MAX,
  entitiesSchema,
  hasEntities,
} from './entities';

describe('entitiesSchema (D97)', () => {
  it('accepts known kinds', () => {
    const v = entitiesSchema.parse({ phones: ['052-1234567'], addresses: ['1 Main St'] });
    expect(v.phones).toEqual(['052-1234567']);
  });

  it('accepts an empty object', () => {
    expect(entitiesSchema.parse({})).toEqual({});
  });

  it('rejects unknown kinds', () => {
    expect(entitiesSchema.safeParse({ emails: ['a@b.c'] }).success).toBe(false);
  });

  it('rejects too many values', () => {
    const phones = Array.from({ length: ENTITY_VALUES_MAX + 1 }, (_, i) => `05${i}`);
    expect(entitiesSchema.safeParse({ phones }).success).toBe(false);
  });

  it('rejects a value that is too long', () => {
    expect(entitiesSchema.safeParse({ people: ['x'.repeat(ENTITY_VALUE_MAX + 1)] }).success).toBe(
      false,
    );
  });

  it('rejects entities over the byte budget', () => {
    const big = Array.from({ length: ENTITY_VALUES_MAX }, () => 'א'.repeat(ENTITY_VALUE_MAX));
    const result = entitiesSchema.safeParse({ people: big, addresses: big });
    expect(JSON.stringify({ people: big, addresses: big }).length).toBeGreaterThan(0);
    expect(result.success).toBe(false);
    expect(ENTITIES_MAX_BYTES).toBe(2048);
  });

  it('trims values and rejects blanks', () => {
    expect(entitiesSchema.parse({ hours: [' 9-17 '] }).hours).toEqual(['9-17']);
    expect(entitiesSchema.safeParse({ hours: ['  '] }).success).toBe(false);
  });
});

describe('compactEntities / hasEntities', () => {
  it('drops empty lists', () => {
    expect(compactEntities({ phones: [], urls: ['https://x.y'] })).toEqual({
      urls: ['https://x.y'],
    });
  });

  it('detects any value', () => {
    expect(hasEntities({})).toBe(false);
    expect(hasEntities(null)).toBe(false);
    expect(hasEntities({ phones: [] })).toBe(false);
    expect(hasEntities({ dates: ['2026-10-17'] })).toBe(true);
  });
});
