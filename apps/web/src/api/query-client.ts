import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { isApiError, isUnauthorized } from './api-error';

/** D56: persisted data lives for a week, so the in-memory cache must keep it as long. */
export const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const MAX_RETRIES = 2;

/** Retry network failures and 5xx; a 4xx answer won't change by asking again. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (isApiError(error) && error.status > 0 && error.status < 500) return false;
  return failureCount < MAX_RETRIES;
}

/** D66: any 401 (query or mutation) hands control to `onUnauthorized`. */
export function createAppQueryClient(onUnauthorized: () => void): QueryClient {
  const onError = (error: unknown) => {
    if (isUnauthorized(error)) onUnauthorized();
  };

  return new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: CACHE_MAX_AGE_MS,
        retry: shouldRetry,
      },
      mutations: { retry: false },
    },
  });
}
