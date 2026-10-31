import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { testQueryClient } from '../test/render';
import { queryKeys, SEARCH_KEY } from './query-keys';

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }));
vi.mock('./client', () => ({
  api: { POST: postMock },
  unwrap: (request: Promise<unknown>) => request,
}));
const { trackContent } = vi.hoisted(() => ({ trackContent: vi.fn() }));
vi.mock('../analytics/analytics', () => ({ trackContent }));
const { useCreateItem } = await import('./create-item');

describe('useCreateItem', () => {
  it('posts the card to the deck and invalidates every item list and search on success', async () => {
    postMock.mockResolvedValueOnce({ id: 'item-1', deckId: 'deck-1', type: 'text' });
    const queryClient = testQueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);
    const { result } = renderHook(() => useCreateItem('me'), { wrapper });

    const input = { type: 'text' as const, title: 'T', payload: {}, categoryIds: [] };
    result.current.mutate(input);

    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.itemLists }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: [SEARCH_KEY] });
    expect(postMock).toHaveBeenCalledWith('/decks/{id}/items', {
      params: { path: { id: 'me' } },
      body: input,
    });
    expect(trackContent).toHaveBeenCalledWith('card-created', {
      deckId: 'deck-1',
      itemId: 'item-1',
      type: 'text',
      channel: 'editor',
    });
  });
});
