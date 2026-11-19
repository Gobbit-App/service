import { QueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { dehydrate } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { CACHE_MAX_AGE_MS } from './query-client';
import { revalidateRestored } from './persist';

const key = ['items', 'family', { kind: 'all' }];
const page = (ids: string[]) => ({ pages: [{ data: ids }], pageParams: [null] });

function List() {
  const q = useInfiniteQuery({
    queryKey: key,
    queryFn: async () => ({ data: ['new', 'old'] }),
    initialPageParam: null,
    getNextPageParam: () => null,
  });
  return <p>{q.data?.pages.flatMap((p) => p.data).join(',')}</p>;
}

it('a list restored from IndexedDB is replaced by the fresh fetch on the next visit', async () => {
  const seed = new QueryClient();
  seed.setQueryData(key, page(['old']));
  const persisted = JSON.stringify({
    buster: 'b',
    timestamp: Date.now(),
    clientState: dehydrate(seed),
  });
  const persister = {
    persistClient: vi.fn(),
    restoreClient: async () => JSON.parse(persisted),
    removeClient: vi.fn(),
  };
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: 60_000, gcTime: CACHE_MAX_AGE_MS } },
  });
  render(
    <PersistQueryClientProvider
      client={client}
      persistOptions={{ persister, maxAge: CACHE_MAX_AGE_MS, buster: 'b' }}
      onSuccess={() => revalidateRestored(client)}
    >
      <List />
    </PersistQueryClientProvider>,
  );
  expect(await screen.findByText('new,old')).toBeTruthy();
});
