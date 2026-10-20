import { QueryClient } from '@tanstack/react-query';
import type { Item } from '@pb/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeItem } from '../test/fixtures';
import type { PagesData } from './favorite-cache';
import { queryKeys, SEARCH_KEY } from './query-keys';

const POST = vi.fn();
const DELETE = vi.fn();
const unwrap = vi.fn();
vi.mock('./client', () => ({ api: { POST, DELETE }, unwrap }));
const { applyLifecycle, belongsTo, expectedItem, rollbackLifecycle, runLifecycle } =
  await import('./item-lifecycle');

const allKey = queryKeys.items('family', { kind: 'all' });
const archivedKey = queryKeys.items('family', { kind: 'archived' });
const deletedKey = queryKeys.items('family', { kind: 'deleted' });

const pages = (...items: Item[]): PagesData => ({
  pages: [{ data: items, nextCursor: null }],
  pageParams: [null],
});
const ids = (qc: QueryClient, key: readonly unknown[]) =>
  qc.getQueryData<PagesData>(key)!.pages[0].data.map((i) => i.id);

const card = makeItem({ id: 'i1', createdAt: '2026-01-02T00:00:00.000Z' });
const older = makeItem({ id: 'i0', createdAt: '2026-01-01T00:00:00.000Z' });

function seed(): QueryClient {
  const qc = new QueryClient();
  qc.setQueryData(allKey, pages(card, older));
  qc.setQueryData(archivedKey, pages());
  qc.setQueryData(deletedKey, pages());
  qc.setQueryData(queryKeys.item('i1'), card);
  return qc;
}

beforeEach(() => {
  POST.mockReset();
  DELETE.mockReset();
  unwrap.mockReset();
});

describe('expectedItem', () => {
  it('maps each action to the state the server returns', () => {
    const now = new Date('2026-02-01T00:00:00.000Z');
    expect(expectedItem(card, 'archive').status).toBe('archived');
    expect(expectedItem({ ...card, status: 'archived' }, 'restore').status).toBe('published');
    expect(expectedItem(card, 'delete', now).deletedAt).toBe(now.toISOString());
    expect('deletedAt' in expectedItem({ ...card, deletedAt: now.toISOString() }, 'undelete')).toBe(
      false,
    );
  });
});

describe('belongsTo', () => {
  it('decides per list, and defers category lists to the refetch', () => {
    const archived = { ...card, status: 'archived' as const };
    expect(belongsTo({ kind: 'archived' }, archived)).toBe(true);
    expect(belongsTo({ kind: 'all' }, archived)).toBe(false);
    expect(belongsTo({ kind: 'deleted' }, { ...card, deletedAt: 'x' })).toBe(true);
    expect(belongsTo({ kind: 'all' }, { ...card, deletedAt: 'x' })).toBe(false);
    expect(belongsTo({ kind: 'category', slug: 'general' }, card)).toBeNull();
    expect(belongsTo({ kind: 'category', slug: 'general' }, archived)).toBe(false);
  });
});

describe('applyLifecycle (D146)', () => {
  it('archive moves the card from the deck list into Archived', async () => {
    const qc = seed();
    await applyLifecycle(qc, { item: card, deckSlug: 'family', action: 'archive' });

    expect(ids(qc, allKey)).toEqual(['i0']);
    expect(ids(qc, archivedKey)).toEqual(['i1']);
    expect(qc.getQueryData<Item>(queryKeys.item('i1'))!.status).toBe('archived');
  });

  it('delete moves the card into Recently deleted', async () => {
    const qc = seed();
    await applyLifecycle(qc, { item: card, deckSlug: 'family', action: 'delete' });

    expect(ids(qc, allKey)).toEqual(['i0']);
    expect(ids(qc, deletedKey)).toEqual(['i1']);
  });

  it('rollback restores every touched query', async () => {
    const qc = seed();
    const before = qc.getQueryData(allKey);
    const snapshot = await applyLifecycle(qc, { item: card, deckSlug: 'family', action: 'delete' });

    rollbackLifecycle(qc, 'i1', snapshot);

    expect(qc.getQueryData(allKey)).toEqual(before);
    expect(ids(qc, deletedKey)).toEqual([]);
    expect(qc.getQueryData<Item>(queryKeys.item('i1'))).toEqual(card);
  });
});

describe('runLifecycle', () => {
  it('sends the action and invalidates search, the deck lists and the card', async () => {
    const qc = seed();
    const invalidate = vi.spyOn(qc, 'invalidateQueries');
    unwrap.mockResolvedValue(undefined);

    await runLifecycle(qc, { item: card, deckSlug: 'family', action: 'archive' });

    expect(POST).toHaveBeenCalledWith('/items/{id}/archive', { params: { path: { id: 'i1' } } });
    const keys = invalidate.mock.calls.map(([filters]) => filters?.queryKey);
    expect(keys).toEqual(
      expect.arrayContaining([
        [SEARCH_KEY],
        queryKeys.deckItemLists('family'),
        queryKeys.item('i1'),
      ]),
    );
  });

  it('delete uses DELETE', async () => {
    const qc = seed();
    unwrap.mockResolvedValue(undefined);
    await runLifecycle(qc, { item: card, deckSlug: 'family', action: 'delete' });
    expect(DELETE).toHaveBeenCalledWith('/items/{id}', { params: { path: { id: 'i1' } } });
  });

  it('rolls back and rethrows when the request fails', async () => {
    const qc = seed();
    // keep the rolled-back cache visible: no refetch in this unit test
    vi.spyOn(qc, 'invalidateQueries').mockResolvedValue(undefined);
    const failure = new Error('network');
    unwrap.mockRejectedValue(failure);

    await expect(
      runLifecycle(qc, { item: card, deckSlug: 'family', action: 'archive' }),
    ).rejects.toBe(failure);

    expect(ids(qc, allKey)).toEqual(['i1', 'i0']);
    expect(ids(qc, archivedKey)).toEqual([]);
  });
});
