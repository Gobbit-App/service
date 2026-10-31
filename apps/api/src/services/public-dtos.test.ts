import { describe, it, expect } from 'vitest';
import type { ItemRow } from '@gobbit/db';
import { publicItemSchema } from '@gobbit/shared';
import { toPublicItem } from './public-dtos';

const at = new Date('2026-10-01T10:00:00.000Z');

const row: ItemRow = {
  id: '00000000-0000-4000-8000-000000000001',
  deckId: '00000000-0000-4000-8000-0000000000d1',
  type: 'text',
  status: 'published',
  title: 'Pharmacy hours',
  body: 'Open 8–20',
  payload: {},
  sourceUrl: 'https://example.com/pharmacy',
  sourceKind: 'share',
  verifiedAt: at,
  createdBy: '00000000-0000-4000-8000-0000000000u1',
  entities: {},
  createdAt: at,
  updatedAt: at,
  deletedAt: null,
  searchText: 'pharmacy hours',
  embeddingModel: 'm',
  embeddedHash: 'h',
  embeddedAt: at,
};

describe('toPublicItem (D174)', () => {
  it('returns exactly the allow-listed keys', () => {
    const dto = toPublicItem(row, []);
    expect(Object.keys(dto).sort()).toEqual(
      [
        'body',
        'categories',
        'createdAt',
        'entities',
        'id',
        'payload',
        'sourceUrl',
        'title',
        'type',
        'updatedAt',
        'verifiedAt',
      ].sort(),
    );
    expect(Object.keys(dto).sort()).toEqual(Object.keys(publicItemSchema.shape).sort());
  });

  it('never carries member, review or ingest data', () => {
    const dto = toPublicItem(row, []) as Record<string, unknown>;
    for (const key of ['deckId', 'status', 'createdBy', 'sourceKind', 'searchText', 'isFavorite']) {
      expect(dto).not.toHaveProperty(key);
    }
  });

  it('lists only public categories', () => {
    const dto = toPublicItem(row, [
      { slug: 'emergency', name: 'Emergency', visibility: 'public' },
      { slug: 'family', name: 'Family', visibility: 'shared' },
      { slug: 'admin', name: 'Admin', visibility: 'private' },
    ]);
    expect(dto.categories).toEqual([{ slug: 'emergency', name: 'Emergency' }]);
  });

  it('serialises dates and a missing source', () => {
    const dto = toPublicItem({ ...row, sourceUrl: null, verifiedAt: null }, []);
    expect(dto.sourceUrl).toBeNull();
    expect(dto.verifiedAt).toBeNull();
    expect(dto.createdAt).toBe('2026-10-01T10:00:00.000Z');
    expect(publicItemSchema.safeParse(dto).success).toBe(true);
  });
});
