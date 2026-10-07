import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import { vi } from 'vitest';
import { NavigateContext } from '../ui/NavLink';

/** A client that never retries, so failures surface on the first attempt. */
export function testQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
}

/** Renders inside a QueryClientProvider and a spy navigation context. */
export function renderWithClient(
  ui: ReactElement,
  { queryClient = testQueryClient(), navigate = vi.fn() } = {},
): RenderResult & { queryClient: QueryClient; navigate: ReturnType<typeof vi.fn> } {
  const result = render(
    <QueryClientProvider client={queryClient}>
      <NavigateContext.Provider value={navigate}>{ui}</NavigateContext.Provider>
    </QueryClientProvider>,
  );
  return { ...result, queryClient, navigate };
}
