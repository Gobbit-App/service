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
  cover: null,
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

  describe('cover (D390)', () => {
    const cover = { publicId: 'gobbit/items/d1/a', width: 800, height: 400 };

    it('reports add, replace and remove', () => {
      expect(diffFields(base, { ...base, cover })).toEqual(['cover']);
      expect(
        diffFields(
          { ...base, cover },
          { ...base, cover: { ...cover, publicId: 'gobbit/items/d1/b' } },
        ),
      ).toEqual(['cover']);
      expect(diffFields({ ...base, cover }, { ...base, cover: null })).toEqual(['cover']);
    });

    it('ignores width/height when the publicId is equal', () => {
      expect(
        diffFields({ ...base, cover }, { ...base, cover: { ...cover, width: 1, height: 2 } }),
      ).toEqual([]);
    });
  });

  describe('event cards (D369)', () => {
    const event: ItemFields = {
      ...base,
      type: 'event',
      payload: {
        allDay: false,
        start: '2030-06-01T18:00:00+03:00',
        timeZone: 'Asia/Jerusalem',
        location: 'Hall',
        url: 'https://example.com/fair',
        notify: {
          before: [{ amount: 1, unit: 'days' }],
          audience: { mode: 'everyone', userIds: [] },
        },
      },
    };
    const withPayload = (patch: Record<string, unknown>): ItemFields => ({
      ...event,
      payload: { ...(event.payload as object), ...patch },
    });

    it('names the changed groups instead of payload', () => {
      expect(diffFields(event, withPayload({ start: '2030-06-02T18:00:00+03:00' }))).toEqual([
        'when',
      ]);
      expect(diffFields(event, withPayload({ end: '2030-06-01T20:00:00+03:00' }))).toEqual([
        'when',
      ]);
      expect(diffFields(event, withPayload({ location: 'Park' }))).toEqual(['location']);
      expect(diffFields(event, withPayload({ preview: { title: 'Fair' } }))).toEqual(['link']);
      expect(
        diffFields(
          event,
          withPayload({ notify: { before: [], audience: { mode: 'me', userIds: [] } } }),
        ),
      ).toEqual(['notify']);
    });

    it('names several groups in order and nothing for an identical payload', () => {
      expect(diffFields(event, withPayload({ notify: undefined, start: 'x', title: 1 }))).toEqual([
        'when',
        'notify',
      ]);
      expect(diffFields(event, withPayload({}))).toEqual([]);
    });

    it('keeps non-event cards on payload', () => {
      expect(diffFields(base, { ...base, payload: { location: 'x' } })).toEqual(['payload']);
    });
  });
});
