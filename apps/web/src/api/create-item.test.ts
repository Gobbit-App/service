import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { testQueryClient } from '../test/render';
import { queryKeys } from './query-keys';

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }));
vi.mock('./client', () => ({
  api: { POST: postMock },
  unwrap: (request: Promise<unknown>) => request,
}));
const { useCreateItem } = await import('./create-item');

describe('useCreateItem', () => {
  it('posts the card to the deck and invalidates every item list on success', async () => {
    postMock.mockResolvedValueOnce({ data: { id: 'item-1' } });
    const queryClient = testQueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);
    const { result } = renderHook(() => useCreateItem('me'), { wrapper });

    const input = { type: 'text' as const, title: 'T', payload: {}, categoryIds: [] };
    result.current.mutate(input);

    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.itemLists }));
    expect(postMock).toHaveBeenCalledWith('/decks/{id}/items', {
      params: { path: { id: 'me' } },
      body: input,
    });
  });
});
