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
  revealAt: null,
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

describe('toPublicItem link markers (D350)', () => {
  it('strips imageLookup and imageRemoved from a link preview', () => {
    const link: ItemRow = {
      ...row,
      type: 'link',
      payload: {
        url: 'https://x.test/',
        preview: { title: 'T', imageLookup: 1, imageRemoved: true },
      },
    };
    expect(toPublicItem(link, []).payload).toEqual({
      url: 'https://x.test/',
      preview: { title: 'T' },
    });
  });

  it('D365: an event payload drops notify and the snapshot markers', () => {
    const event: ItemRow = {
      ...row,
      type: 'event',
      payload: {
        allDay: false,
        start: '2030-06-01T18:00:00Z',
        timeZone: 'UTC',
        location: 'Hall',
        url: 'https://x.test/',
        preview: { title: 'T', imageLookup: 1 },
        notify: { before: [], audience: { mode: 'people', userIds: ['u1'] } },
      },
    };
    expect(toPublicItem(event, []).payload).toEqual({
      allDay: false,
      start: '2030-06-01T18:00:00Z',
      timeZone: 'UTC',
      location: 'Hall',
      url: 'https://x.test/',
      preview: { title: 'T' },
    });
  });
});

describe('toPublicItem media allow-list (D397)', () => {
  const media = (payload: Record<string, unknown>) =>
    toPublicItem({ ...row, type: 'media', payload }, []).payload;

  it('keeps every photo of a gallery in order with its alt and size, nothing else', () => {
    expect(
      media({
        kind: 'image',
        images: [
          { publicId: 'a', alt: 'Cover', width: 3, height: 4, secret: 'x' },
          { publicId: 'b' },
        ],
      }),
    ).toEqual({
      kind: 'image',
      images: [{ publicId: 'a', alt: 'Cover', width: 3, height: 4 }, { publicId: 'b' }],
    });
  });

  it("keeps a file's display facts but never its file name", () => {
    expect(
      media({
        kind: 'pdf',
        publicId: 'f',
        alt: 'Term dates',
        width: 595,
        height: 842,
        pages: 3,
        fileName: 'dana-medical-letter.pdf',
        bytes: 10,
        format: 'pdf',
      }),
    ).toEqual({ kind: 'pdf', publicId: 'f', alt: 'Term dates', width: 595, height: 842, pages: 3 });
    expect(media({ kind: 'audio', publicId: 'a', durationMs: 4100, fileName: 'memo.m4a' })).toEqual(
      { kind: 'audio', publicId: 'a', durationMs: 4100 },
    );
  });

  it('drops an unreadable media payload', () => {
    expect(media({ kind: 'zip', publicId: 'z' })).toEqual({});
  });
});
