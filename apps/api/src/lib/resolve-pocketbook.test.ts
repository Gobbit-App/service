import { describe, it, expect, vi } from 'vitest';
import { isUuid, resolvePocketbook } from './resolve-pocketbook';
import type { PocketbookRow } from '@pb/db';

describe('isUuid', () => {
  it('returns true for a v4 uuid', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    expect(isUuid(uuid)).toBe(true);
  });

  it('returns false for a slug', () => {
    expect(isUuid('family')).toBe(false);
  });
});

describe('resolvePocketbook', () => {
  it('calls findById when given a uuid', async () => {
    const mockRow: PocketbookRow = {
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
    const result = await resolvePocketbook(repo, uuid);

    expect(findById).toHaveBeenCalledWith(uuid);
    expect(findBySlug).not.toHaveBeenCalled();
    expect(result).toBe(mockRow);
  });

  it('calls findBySlug when given a slug', async () => {
    const mockRow: PocketbookRow = {
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

    const result = await resolvePocketbook(repo, 'family');

    expect(findById).not.toHaveBeenCalled();
    expect(findBySlug).toHaveBeenCalledWith('family');
    expect(result).toBe(mockRow);
  });

  it('throws 404 when findById returns null', async () => {
    const findById = vi.fn().mockResolvedValue(null);
    const findBySlug = vi.fn();
    const repo = { findById, findBySlug };

    const uuid = '550e8400-e29b-41d4-a716-446655440000';

    await expect(resolvePocketbook(repo, uuid)).rejects.toMatchObject({ status: 404 });
  });

  it('throws 404 when findBySlug returns null', async () => {
    const findById = vi.fn();
    const findBySlug = vi.fn().mockResolvedValue(null);
    const repo = { findById, findBySlug };

    await expect(resolvePocketbook(repo, 'nonexistent')).rejects.toMatchObject({ status: 404 });
  });
});
