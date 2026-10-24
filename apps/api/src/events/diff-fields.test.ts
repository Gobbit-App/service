import { describe, expect, it } from 'vitest';
import { diffFields, type ItemFields } from './diff-fields';

const base: ItemFields = {
  title: 'Plumber',
  body: 'Dan',
  payload: { a: 1, b: [1, 2] },
  sourceUrl: null,
  entities: {},
  verifiedAt: new Date('2026-01-01T00:00:00.000Z'),
  type: 'text',
  status: 'published',
  categoryIds: ['c1', 'c2'],
};

describe('diffFields (D187)', () => {
  it('is empty for an identical card (a no-op save)', () => {
    expect(diffFields(base, { ...base })).toEqual([]);
  });

  it('names changed fields in itemEventFields order', () => {
    const after = { ...base, status: 'archived' as const, body: 'Dan 2', title: 'Plumbers' };
    expect(diffFields(base, after)).toEqual(['title', 'body', 'status']);
  });

  it('compares categories as sets', () => {
    expect(diffFields(base, { ...base, categoryIds: ['c2', 'c1'] })).toEqual([]);
    expect(diffFields(base, { ...base, categoryIds: ['c1'] })).toEqual(['categories']);
  });

  it('compares JSON by value, ignoring key order', () => {
    expect(diffFields(base, { ...base, payload: { b: [1, 2], a: 1 } })).toEqual([]);
    expect(diffFields(base, { ...base, payload: { a: 1, b: [2, 1] } })).toEqual(['payload']);
  });

  it('compares entities by value', () => {
    expect(diffFields(base, { ...base, entities: {} })).toEqual([]);
    expect(diffFields(base, { ...base, entities: { phones: ['1'] } })).toEqual(['entities']);
  });

  it('compares verifiedAt by instant', () => {
    expect(diffFields(base, { ...base, verifiedAt: new Date('2026-01-01T00:00:00.000Z') })).toEqual(
      [],
    );
    expect(diffFields(base, { ...base, verifiedAt: null })).toEqual(['verifiedAt']);
  });
});
