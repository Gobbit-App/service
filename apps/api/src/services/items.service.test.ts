import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createItemsService } from './items.service';
import type { CurrentUser } from '../types';

type ItemsRepo = any;
type CategoriesRepo = any;
type DecksRepo = any;
type FavoritesRepo = any;

const USER: CurrentUser = {
  id: 'u1',
  accountId: 'a1',
  email: 'dev@example.test',
  displayName: 'dev',
};

const PB_ID = '550e8400-e29b-41d4-a716-446655440000';
const DEFAULT_CAT = '550e8400-e29b-41d4-a716-446655440001';

const PB_ROW = {
  id: PB_ID,
  ownerAccountId: 'a1',
  slug: 'fam',
  name: 'Family',
  kind: 'shared',
  isPublic: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

const KNOWN_CATS = new Set([DEFAULT_CAT, 'cat-2']);

function createItemRow(overrides = {}) {
  return {
    id: '550e8400-e29b-41d4-a716-446655440002',
    deckId: PB_ID,
    type: 'table',
    status: 'published',
    title: 'Test Item',
    body: 'Body',
    payload: {},
    sourceUrl: null,
    sourceKind: 'manual',
    verifiedAt: new Date(),
    createdBy: USER.id,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

describe('createItemsService', () => {
  let service: any;
  let decks: any;
  let categories: any;
  let items: any;
  let favorites: any;
  let memberships: any;

  beforeEach(() => {
    decks = {
      findBySlug: vi.fn().mockResolvedValue(PB_ROW),
      findById: vi.fn().mockResolvedValue(PB_ROW),
    } as unknown as DecksRepo;

    categories = {
      findDefault: vi.fn().mockResolvedValue({ id: DEFAULT_CAT }),
      findExistingIds: vi.fn().mockImplementation((pbId: string, ids: string[]) => {
        return Promise.resolve(ids.filter((id) => KNOWN_CATS.has(id)));
      }),
    } as unknown as CategoriesRepo;

    items = {
      create: vi.fn().mockResolvedValue(createItemRow()),
      findById: vi.fn().mockResolvedValue(createItemRow()),
      update: vi.fn().mockResolvedValue(createItemRow()),
      isVisibleTo: vi.fn().mockResolvedValue(true),
      categoryIdsFor: vi.fn().mockResolvedValue(new Map([[PB_ID, [DEFAULT_CAT]]])),
    } as unknown as ItemsRepo;

    favorites = {
      favoritedAmong: vi.fn().mockResolvedValue(new Set()),
    } as unknown as FavoritesRepo;

    memberships = { findActive: vi.fn().mockResolvedValue(null) };

    service = createItemsService({
      decks,
      categories,
      items,
      favorites,
      memberships,
    });
  });

  describe('create', () => {
    it('D6: uses default category when categoryIds not provided', async () => {
      const input = {
        type: 'text',
        title: 'New Item',
        body: '',
        payload: {},
      };

      await service.create(USER, 'fam', input);

      expect(items.create).toHaveBeenCalledWith(
        expect.objectContaining({
          deckId: PB_ID,
        }),
        [DEFAULT_CAT],
      );
    });

    it('rejects unknown category id with 400 error at path categoryIds', async () => {
      const input = {
        type: 'text',
        title: 'New Item',
        body: '',
        categoryIds: ['unknown-cat-id'],
        payload: {},
      };

      await expect(service.create(USER, 'fam', input)).rejects.toMatchObject({
        status: 400,
        errors: expect.arrayContaining([
          expect.objectContaining({
            path: 'categoryIds',
          }),
        ]),
      });

      expect(items.create).not.toHaveBeenCalled();
    });

    it('D13: sets verifiedAt to Date when status is published', async () => {
      const input = {
        type: 'text',
        title: 'New Item',
        body: '',
        status: 'published',
        payload: {},
      };

      await service.create(USER, 'fam', input);

      expect(items.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'published',
          verifiedAt: expect.any(Date),
        }),
        expect.any(Array),
      );
    });

    it('D13: sets verifiedAt to null when status is proposed', async () => {
      const input = {
        type: 'text',
        title: 'New Item',
        body: '',
        status: 'proposed',
        payload: {},
      };

      await service.create(USER, 'fam', input);

      expect(items.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'proposed',
          verifiedAt: null,
        }),
        expect.any(Array),
      );
    });
  });

  describe('update', () => {
    it('D6: rejects empty categoryIds on published item with 422', async () => {
      const itemId = '550e8400-e29b-41d4-a716-446655440002';
      items.findById.mockResolvedValue(createItemRow({ status: 'published', type: 'text' }));
      items.categoryIdsFor.mockResolvedValue(new Map([[itemId, [DEFAULT_CAT]]]));

      const patch = { categoryIds: [] };

      await expect(service.update(USER, itemId, patch)).rejects.toMatchObject({
        status: 422,
        type: '/problems/item-needs-category',
      });

      expect(items.update).not.toHaveBeenCalled();
    });

    it('D6: allows empty categoryIds when status is archived', async () => {
      const itemId = '550e8400-e29b-41d4-a716-446655440002';
      items.findById.mockResolvedValue(createItemRow({ status: 'published', type: 'text' }));
      items.categoryIdsFor.mockResolvedValue(new Map([[itemId, [DEFAULT_CAT]]]));

      const patch = { categoryIds: [], status: 'archived' };

      await service.update(USER, itemId, patch);

      expect(items.update).toHaveBeenCalled();
    });

    it('D12: rejects update with type field', async () => {
      const itemId = '550e8400-e29b-41d4-a716-446655440002';
      items.findById.mockResolvedValue(createItemRow());

      const patch = { type: 'link' } as any;

      await expect(service.update(USER, itemId, patch)).rejects.toMatchObject({
        status: 400,
      });
    });

    it('rejects invalid payload for stored type', async () => {
      const itemId = '550e8400-e29b-41d4-a716-446655440002';
      items.findById.mockResolvedValue(createItemRow({ type: 'table' }));

      const patch = { payload: { columns: [] } };

      await expect(service.update(USER, itemId, patch)).rejects.toThrow();
    });

    it('returns 404 for item owned by different account', async () => {
      const itemId = '550e8400-e29b-41d4-a716-446655440002';
      const otherItem = createItemRow({ deckId: 'other-pb' });
      items.findById.mockResolvedValue(otherItem);
      decks.findById.mockResolvedValue({
        ...PB_ROW,
        ownerAccountId: 'other-account',
      });

      const patch = { title: 'Updated' };

      await expect(service.update(USER, itemId, patch)).rejects.toMatchObject({
        status: 404,
      });
    });

    it('403s a reader member trying to update', async () => {
      const itemId = '550e8400-e29b-41d4-a716-446655440002';
      decks.findById.mockResolvedValue({ ...PB_ROW, ownerAccountId: 'other-account' });
      memberships.findActive.mockResolvedValue({ role: 'reader', acceptedAt: new Date() });

      await expect(service.update(USER, itemId, { title: 'x' })).rejects.toMatchObject({
        status: 403,
      });
      expect(items.update).not.toHaveBeenCalled();
    });
  });
});
