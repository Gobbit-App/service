import { describe, it, expect, vi } from 'vitest';
import { isUuid, resolveDeck } from './resolve-deck';
import type { DeckRow } from '@gobbit/db';

const caller = { accountId: 'caller-account' };

function makeRow(overrides: Partial<DeckRow> = {}): DeckRow {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    kind: 'personal',
    slug: 'test',
    name: 'Test',
    ownerAccountId: 'owner-id',
    isPublic: false,
    isDefault: false,
    autoPublishShares: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

function makeRepo(overrides: Partial<Record<string, ReturnType<typeof vi.fn>>> = {}) {
  return {
    findById: vi.fn().mockResolvedValue(null),
    findBySlug: vi.fn().mockResolvedValue(null),
    findDefaultForAccount: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

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
    const mockRow = makeRow();
    const repo = makeRepo({ findById: vi.fn().mockResolvedValue(mockRow) });

    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const result = await resolveDeck(repo, uuid, caller);

    expect(repo.findById).toHaveBeenCalledWith(uuid);
    expect(repo.findBySlug).not.toHaveBeenCalled();
    expect(result).toBe(mockRow);
  });

  it('calls findBySlug when given a slug', async () => {
    const mockRow = makeRow({ id: 'some-id', slug: 'family', name: 'Family' });
    const repo = makeRepo({ findBySlug: vi.fn().mockResolvedValue(mockRow) });

    const result = await resolveDeck(repo, 'family', caller);

    expect(repo.findById).not.toHaveBeenCalled();
    expect(repo.findBySlug).toHaveBeenCalledWith('family');
    expect(result).toBe(mockRow);
  });

  it('throws 404 when findById returns null', async () => {
    const repo = makeRepo();
    const uuid = '550e8400-e29b-41d4-a716-446655440000';

    await expect(resolveDeck(repo, uuid, caller)).rejects.toMatchObject({ status: 404 });
  });

  it('throws 404 when findBySlug returns null', async () => {
    const repo = makeRepo();

    await expect(resolveDeck(repo, 'nonexistent', caller)).rejects.toMatchObject({ status: 404 });
  });

  it('resolves "me" to the caller personal deck, never by slug', async () => {
    const mockRow = makeRow({ isDefault: true, kind: 'personal' });
    const repo = makeRepo({ findDefaultForAccount: vi.fn().mockResolvedValue(mockRow) });

    const result = await resolveDeck(repo, 'me', caller);

    expect(repo.findDefaultForAccount).toHaveBeenCalledWith('caller-account');
    expect(repo.findBySlug).not.toHaveBeenCalled();
    expect(repo.findById).not.toHaveBeenCalled();
    expect(result).toBe(mockRow);
  });

  it('throws 404 for "me" when the caller has no personal deck', async () => {
    const repo = makeRepo();

    await expect(resolveDeck(repo, 'me', caller)).rejects.toMatchObject({
      status: 404,
      detail: 'Deck not found',
    });
  });
});
