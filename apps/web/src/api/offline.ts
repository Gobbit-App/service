import { useSyncExternalStore } from 'react';
import { useQueryClient, type Query } from '@tanstack/react-query';
import { shouldShowOfflineBanner } from './network-state';

function subscribeOnline(onChange: () => void): () => void {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

/** D56: cached data is on screen while the network (or the API behind Caddy) is failing. */
export function anyQueryOffline(
  queries: readonly Pick<Query, 'state'>[],
  online: boolean,
): boolean {
  return queries.some((q) =>
    shouldShowOfflineBanner({
      error: q.state.error,
      hasData: q.state.data !== undefined,
      online,
    }),
  );
}

/** Recomputes on every cache event; a successful refetch clears the error and the banner. */
export function useOfflineBanner(): boolean {
  const online = useOnline();
  const cache = useQueryClient().getQueryCache();
  return useSyncExternalStore(
    (onChange) => cache.subscribe(onChange),
    () => anyQueryOffline(cache.getAll(), online),
    () => false,
  );
}
