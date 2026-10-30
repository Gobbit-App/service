import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { revalidateRestored, shouldPersistQuery } from './persist';
import { queryKeys } from './query-keys';

async function settledQuery(key: readonly unknown[]) {
  const client = new QueryClient();
  await client.prefetchQuery({ queryKey: key, queryFn: () => ({ ok: true }) });
  return client.getQueryCache().find({ queryKey: key })!;
}

describe('shouldPersistQuery (D79)', () => {
  it('keeps deck and item data', async () => {
    expect(shouldPersistQuery(await settledQuery(queryKeys.deck('family')))).toBe(true);
    expect(shouldPersistQuery(await settledQuery(queryKeys.item('i1')))).toBe(true);
  });

  it('never persists search results', async () => {
    expect(shouldPersistQuery(await settledQuery(queryKeys.search('family', 'wifi')))).toBe(false);
  });

  it('never persists the review queue (D107)', async () => {
    expect(shouldPersistQuery(await settledQuery(queryKeys.review('family')))).toBe(false);
    expect(shouldPersistQuery(await settledQuery(queryKeys.reviewCount('family')))).toBe(false);
  });

  it('never persists the admin waitlist, which holds emails (032)', async () => {
    const key = queryKeys.adminWaitlist('confirmed', null);
    expect(shouldPersistQuery(await settledQuery(key))).toBe(false);
  });
});

describe('revalidateRestored', () => {
  it('marks restored data stale so active queries refetch', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000 } } });
    await client.prefetchQuery({ queryKey: queryKeys.item('i1'), queryFn: () => ({ ok: true }) });
    expect(client.getQueryState(queryKeys.item('i1'))?.isInvalidated).toBe(false);

    await revalidateRestored(client);

    expect(client.getQueryState(queryKeys.item('i1'))?.isInvalidated).toBe(true);
  });
});
