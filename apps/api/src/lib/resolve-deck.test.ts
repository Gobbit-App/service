import { describe, it, expect, vi } from 'vitest';
import { isUuid, resolveDeck } from './resolve-deck';
import type { DeckRow } from '@pb/db';

describe('isUuid', () => {
  it('returns true for a v4 uuid', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    expect(isUuid(uuid)).toBe(true);
  });

  it('returns false for a slug', () => {
    expect(isUuid('family')).toBe(false);
  });
});

describe('resolveDeck', () => {
  it('calls findById when given a uuid', async () => {
    const mockRow: DeckRow = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      kind: 'personal',
      slug: 'test',
      name: 'Test',
      ownerAccountId: 'owner-id',
      isPublic: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };

    const findById = vi.fn().mockResolvedValue(mockRow);
    const findBySlug = vi.fn();
    const repo = { findById, findBySlug };

    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const result = await resolveDeck(repo, uuid);

    expect(findById).toHaveBeenCalledWith(uuid);
    expect(findBySlug).not.toHaveBeenCalled();
    expect(result).toBe(mockRow);
  });

  it('calls findBySlug when given a slug', async () => {
    const mockRow: DeckRow = {
      id: 'some-id',
      kind: 'personal',
      slug: 'family',
      name: 'Family',
      ownerAccountId: 'owner-id',
      isPublic: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };

    const findById = vi.fn();
    const findBySlug = vi.fn().mockResolvedValue(mockRow);
    const repo = { findById, findBySlug };

    const result = await resolveDeck(repo, 'family');

    expect(findById).not.toHaveBeenCalled();
    expect(findBySlug).toHaveBeenCalledWith('family');
    expect(result).toBe(mockRow);
  });

  it('throws 404 when findById returns null', async () => {
    const findById = vi.fn().mockResolvedValue(null);
    const findBySlug = vi.fn();
    const repo = { findById, findBySlug };

    const uuid = '550e8400-e29b-41d4-a716-446655440000';

    await expect(resolveDeck(repo, uuid)).rejects.toMatchObject({ status: 404 });
  });

  it('throws 404 when findBySlug returns null', async () => {
    const findById = vi.fn();
    const findBySlug = vi.fn().mockResolvedValue(null);
    const repo = { findById, findBySlug };

    await expect(resolveDeck(repo, 'nonexistent')).rejects.toMatchObject({ status: 404 });
  });
});
