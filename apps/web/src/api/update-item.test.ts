import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { ReviewList } from '@pb/shared';
import { makeItem } from '../test/fixtures';
import { testQueryClient } from '../test/render';
import { queryKeys, REVIEW_KEY, SEARCH_KEY } from './query-keys';

const { patchMock } = vi.hoisted(() => ({ patchMock: vi.fn() }));
vi.mock('./client', () => ({
  api: { PATCH: patchMock },
  unwrap: (request: Promise<unknown>) => request,
}));
const { useUpdateItem } = await import('./update-item');

function setup() {
  const queryClient = testQueryClient();
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  const { result } = renderHook(() => useUpdateItem('family'), { wrapper });
  return { queryClient, invalidate, result };
}

describe('useUpdateItem', () => {
  it('patches the item, stores the response and invalidates lists and search', async () => {
    const updated = makeItem({ id: 'i1', title: 'New' });
    patchMock.mockResolvedValueOnce(updated);
    const { queryClient, invalidate, result } = setup();

    result.current.mutate({ itemId: 'i1', patch: { title: 'New' } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(patchMock).toHaveBeenCalledWith('/items/{id}', {
      params: { path: { id: 'i1' } },
      body: { title: 'New' },
    });
    expect(queryClient.getQueryData(queryKeys.item('i1'))).toEqual(updated);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.itemLists });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: [SEARCH_KEY] });
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: [REVIEW_KEY] });
  });

  it('swaps a proposal into the review queue and invalidates the queue', async () => {
    const before = makeItem({ id: 'p1', status: 'proposed', title: 'Old' });
    const updated = { ...before, title: 'Edited' };
    patchMock.mockResolvedValueOnce(updated);
    const { queryClient, invalidate, result } = setup();
    const list = { data: [{ item: before }] } as unknown as ReviewList;
    queryClient.setQueryData(queryKeys.review('family'), list);

    result.current.mutate({ itemId: 'p1', patch: { title: 'Edited' } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const cached = queryClient.getQueryData<ReviewList>(queryKeys.review('family'));
    expect(cached?.data[0]?.item.title).toBe('Edited');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: [REVIEW_KEY] });
  });

  it('surfaces a failed patch', async () => {
    patchMock.mockRejectedValueOnce(new Error('boom'));
    const { result } = setup();
    result.current.mutate({ itemId: 'i1', patch: { title: 'x' } });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
