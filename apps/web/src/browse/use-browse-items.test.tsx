import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeItem } from '../test/fixtures';
import { testQueryClient } from '../test/render';

vi.mock('../api/client', () => import('../test/api-mock').then((m) => m.clientModule));
const { respond } = await import('../test/api-mock');
const { itemsQuery } = await import('../api/queries');
const { useBrowseItems, usePrefetchAhead, SEEK_MAX_PAGES } = await import('./use-browse-items');

const filter = { kind: 'category', slug: 'food' } as const;

function wrapper(client = testQueryClient()) {
  return {
    client,
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  };
}

let page = 0;
function pageOf(prefix: string, more: boolean) {
  page += 1;
  return {
    data: [makeItem({ id: `${prefix}${page}` })],
    nextCursor: more ? `cursor-${page}` : null,
  };
}

describe('useBrowseItems', () => {
  beforeEach(() => {
    respond.mockReset();
    page = 0;
  });

  it('reads the list query (same key, same cache)', async () => {
    respond.mockResolvedValue({ data: [makeItem({ id: 'a' })], nextCursor: null });
    const { client, wrapper: Wrapper } = wrapper();
    const { result } = renderHook(() => useBrowseItems('family', filter, undefined), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(client.getQueryData(itemsQuery('family', filter).queryKey)).toBeDefined();
    expect(result.current.total).toBe(1);
    expect(result.current.notFound).toBe(false);
  });

  it('seeks a deep-linked card through later pages', async () => {
    respond.mockImplementation(() => Promise.resolve(pageOf('p', true)));
    const { wrapper: Wrapper } = wrapper();
    const { result } = renderHook(() => useBrowseItems('family', filter, 'p3'), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.items.map((i) => i.id)).toContain('p3'));
    expect(result.current.seeking).toBe(false);
    expect(result.current.notFound).toBe(false);
    expect(result.current.total).toBeNull();
  });

  it(`gives up after ${SEEK_MAX_PAGES} pages and reports notFound`, async () => {
    respond.mockImplementation(() => Promise.resolve(pageOf('p', true)));
    const { wrapper: Wrapper } = wrapper();
    const { result } = renderHook(() => useBrowseItems('family', filter, 'missing'), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.notFound).toBe(true));
    expect(result.current.items).toHaveLength(SEEK_MAX_PAGES);
    expect(respond).toHaveBeenCalledTimes(SEEK_MAX_PAGES);
  });

  it('reports notFound at once when the last page is loaded', async () => {
    respond.mockResolvedValue({ data: [makeItem({ id: 'a' })], nextCursor: null });
    const { wrapper: Wrapper } = wrapper();
    const { result } = renderHook(() => useBrowseItems('family', filter, 'gone'), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.notFound).toBe(true));
    expect(respond).toHaveBeenCalledTimes(1);
  });
});

describe('usePrefetchAhead', () => {
  const setup = (
    currentIndex: number,
    extra: { hasNextPage?: boolean; fetching?: boolean } = {},
  ) => {
    const fetchNextPage = vi.fn(() => Promise.resolve());
    renderHook(() =>
      usePrefetchAhead({
        currentIndex,
        loaded: 20,
        hasNextPage: extra.hasNextPage ?? true,
        isFetchingNextPage: extra.fetching ?? false,
        fetchNextPage,
      }),
    );
    return fetchNextPage;
  };

  it('fetches the next page at loaded − 3', () => {
    expect(setup(16)).not.toHaveBeenCalled();
    expect(setup(17)).toHaveBeenCalledTimes(1);
    expect(setup(19)).toHaveBeenCalledTimes(1);
  });

  it('does not fetch without a next page, while fetching or before positioning', () => {
    expect(setup(18, { hasNextPage: false })).not.toHaveBeenCalled();
    expect(setup(18, { fetching: true })).not.toHaveBeenCalled();
    expect(setup(-1)).not.toHaveBeenCalled();
  });
});
