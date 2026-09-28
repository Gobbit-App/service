import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { CurrentUser } from '../types';
import { createPocketbooksService } from './pocketbooks.service';

vi.mock('../lib/slug', async () => {
  const { default: slugify } = await import('@sindresorhus/slugify');
  const { SLUG_MAX } = await import('@pb/shared');

  const implementation = (input: string): string => {
    if (input === 'שלום') return '';
    let slug = slugify(input);
    if (slug.length > SLUG_MAX) slug = slug.slice(0, SLUG_MAX);
    slug = slug.replace(/-+$/, '');
    return slug;
  };

  return { toSlug: vi.fn(implementation) };
});

describe('createPocketbooksService', () => {
  let service: ReturnType<typeof createPocketbooksService>;
  let pocketbooksRepo: any;
  let categoriesRepo: any;
  let user: CurrentUser;

  beforeEach(() => {
    pocketbooksRepo = {
      listByOwner: vi.fn(),
      findById: vi.fn(),
      findBySlug: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    };

    categoriesRepo = {
      listByPocketbook: vi.fn(),
      findBySlug: vi.fn(),
      findDefault: vi.fn(),
      findExistingIds: vi.fn(),
      maxPosition: vi.fn(),
      create: vi.fn(),
    };

    service = createPocketbooksService({
      pocketbooks: pocketbooksRepo,
      categories: categoriesRepo,
    });

    user = {
      id: 'user-1',
      accountId: 'account-1',
      email: 'test@example.com',
    };

    vi.clearAllMocks();
  });

  describe('create', () => {
    it('derives slug from name and creates pocketbook with correct defaults', async () => {
      const mockPocketbook = {
        id: 'pb-1',
        kind: 'personal' as const,
        slug: 'my-family',
        name: 'My Family',
        ownerAccountId: user.accountId,
        isPublic: false,
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-01T00:00:00.000Z'),
        deletedAt: null,
      };

      const mockCategory = {
        id: 'cat-1',
        pocketbookId: 'pb-1',
        slug: 'general',
        name: 'General',
        visibility: 'shared' as const,
        isDefault: true,
        position: 0,
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-01T00:00:00.000Z'),
        deletedAt: null,
      };

      pocketbooksRepo.create.mockResolvedValue(mockPocketbook);
      categoriesRepo.listByPocketbook.mockResolvedValue([mockCategory]);

      const result = await service.create(user, { name: 'My Family' });

      expect(pocketbooksRepo.create).toHaveBeenCalledWith({
        name: 'My Family',
        slug: 'my-family',
        kind: 'personal',
        isPublic: false,
        ownerAccountId: user.accountId,
      });

      expect(categoriesRepo.listByPocketbook).toHaveBeenCalledWith('pb-1');

      expect(result.categories).toHaveLength(1);
      expect(result.categories[0].slug).toBe('general');
    });

    it('throws 400 with slug error when derived slug is empty', async () => {
      await expect(service.create(user, { name: 'שלום' })).rejects.toMatchObject({
        status: 400,
        type: '/problems/bad-request',
        detail: expect.stringContaining('Could not derive a slug'),
        errors: expect.arrayContaining([
          expect.objectContaining({
            path: 'slug',
            message: 'Required',
          }),
        ]),
      });

      expect(pocketbooksRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('get', () => {
    it('returns 404 when pocketbook is owned by another account', async () => {
      const otherUserPocketbook = {
        id: 'pb-3',
        kind: 'personal' as const,
        slug: 'other-family',
        name: 'Other Family',
        ownerAccountId: 'other-account-id',
        isPublic: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      pocketbooksRepo.findBySlug.mockResolvedValue(otherUserPocketbook);

      await expect(service.get(user, 'other-family')).rejects.toMatchObject({
        status: 404,
        type: '/problems/not-found',
      });
    });
  });
});
