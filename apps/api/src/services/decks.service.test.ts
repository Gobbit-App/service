import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { CurrentUser } from '../types';
import { createDecksService } from './decks.service';

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

describe('createDecksService', () => {
  let service: ReturnType<typeof createDecksService>;
  let decksRepo: any;
  let categoriesRepo: any;
  let membershipsRepo: any;
  let user: CurrentUser;

  beforeEach(() => {
    decksRepo = {
      listByOwner: vi.fn(),
      findById: vi.fn(),
      findBySlug: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      softDelete: vi.fn(),
    };

    categoriesRepo = {
      listByDeck: vi.fn(),
      findBySlug: vi.fn(),
      findDefault: vi.fn(),
      findExistingIds: vi.fn(),
      maxPosition: vi.fn(),
      create: vi.fn(),
    };

    membershipsRepo = { findActive: vi.fn().mockResolvedValue(null) };

    service = createDecksService({
      decks: decksRepo,
      categories: categoriesRepo,
      memberships: membershipsRepo,
    });

    user = {
      id: 'user-1',
      accountId: 'account-1',
      email: 'test@example.com',
      displayName: 'test',
    };
  });

  describe('create', () => {
    it('derives slug from name and creates deck with correct defaults', async () => {
      const mockDeck = {
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
        deckId: 'pb-1',
        slug: 'general',
        name: 'General',
        visibility: 'shared' as const,
        isDefault: true,
        position: 0,
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-01T00:00:00.000Z'),
        deletedAt: null,
      };

      decksRepo.create.mockResolvedValue(mockDeck);
      categoriesRepo.listByDeck.mockResolvedValue([mockCategory]);

      const result = await service.create(user, { name: 'My Family' });

      expect(decksRepo.create).toHaveBeenCalledWith({
        name: 'My Family',
        slug: 'my-family',
        kind: 'personal',
        isPublic: false,
        ownerAccountId: user.accountId,
      });

      expect(categoriesRepo.listByDeck).toHaveBeenCalledWith('pb-1', 'owner');
      expect(result.role).toBe('owner');

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

      expect(decksRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('get', () => {
    it('returns 404 when deck is owned by another account', async () => {
      const otherUserDeck = {
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

      decksRepo.findBySlug.mockResolvedValue(otherUserDeck);

      await expect(service.get(user, 'other-family')).rejects.toMatchObject({
        status: 404,
        type: '/problems/not-found',
      });
      expect(membershipsRepo.findActive).toHaveBeenCalledWith('pb-3', user.id);
    });

    it('returns the deck with the member role for an accepted reader', async () => {
      decksRepo.findBySlug.mockResolvedValue({
        id: 'pb-3',
        kind: 'shared' as const,
        slug: 'other-family',
        name: 'Other Family',
        ownerAccountId: 'other-account-id',
        isPublic: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });
      membershipsRepo.findActive.mockResolvedValue({ role: 'reader', acceptedAt: new Date() });

      const result = await service.get(user, 'other-family');

      expect(result.role).toBe('reader');
    });

    it('ignores a pending (unaccepted) membership', async () => {
      decksRepo.findBySlug.mockResolvedValue({
        id: 'pb-3',
        ownerAccountId: 'other-account-id',
        slug: 'other-family',
      });
      membershipsRepo.findActive.mockResolvedValue({ role: 'editor', acceptedAt: null });

      await expect(service.get(user, 'other-family')).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('remove', () => {
    const deck = {
      id: '00000000-0000-4000-8000-000000000001',
      kind: 'shared' as const,
      slug: 'fam',
      name: 'Fam',
      isPublic: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };

    it('soft-deletes an owned deck', async () => {
      decksRepo.findBySlug.mockResolvedValue({ ...deck, ownerAccountId: user.accountId });
      await service.remove(user, 'fam');
      expect(decksRepo.softDelete).toHaveBeenCalledWith(deck.id);
    });

    it('403s an editor member without deleting', async () => {
      decksRepo.findBySlug.mockResolvedValue({ ...deck, ownerAccountId: 'someone-else' });
      membershipsRepo.findActive.mockResolvedValue({ role: 'editor', acceptedAt: new Date() });
      await expect(service.remove(user, 'fam')).rejects.toMatchObject({ status: 403 });
      expect(decksRepo.softDelete).not.toHaveBeenCalled();
    });

    it('403s a co-owner (owner membership) without deleting (D50)', async () => {
      decksRepo.findBySlug.mockResolvedValue({ ...deck, ownerAccountId: 'someone-else' });
      membershipsRepo.findActive.mockResolvedValue({ role: 'owner', acceptedAt: new Date() });
      await expect(service.remove(user, 'fam')).rejects.toMatchObject({
        status: 403,
        type: '/problems/forbidden',
      });
      expect(decksRepo.softDelete).not.toHaveBeenCalled();
    });

    it("404s on another account's deck without deleting", async () => {
      decksRepo.findBySlug.mockResolvedValue({ ...deck, ownerAccountId: 'someone-else' });
      await expect(service.remove(user, 'fam')).rejects.toMatchObject({ status: 404 });
      expect(decksRepo.softDelete).not.toHaveBeenCalled();
    });
  });
});
