import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import {
  createBrowserHistory,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  type AnyRouter,
} from '@tanstack/react-router';
import { act, render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import { vi } from 'vitest';
import { historyNavigate } from '../app/history-navigate';
import { NavigateContext, type NavigateHref } from '../ui/NavLink';
import { testQueryClient } from './render';

function browserHistoryAt(path: string) {
  window.history.replaceState(null, '', path);
  return createBrowserHistory();
}

export type RouterRender = RenderResult & {
  queryClient: QueryClient;
  router: AnyRouter;
  /** Spy around the real history navigation (the guard sees every call). */
  navigate: ReturnType<typeof vi.fn<NavigateHref>>;
  /** The current address (path + search). */
  location: () => string;
};

/**
 * Renders `ui` at `path` inside a real router (memory history unless `browser`), so `useBlocker` and the
 * unsaved-changes guard work; every other address renders "Elsewhere".
 */
export async function renderInRouter(
  ui: ReactElement,
  {
    path = '/here',
    queryClient = testQueryClient(),
    /** Use the jsdom window's history (needed for `beforeunload`). */
    browser = false,
    /** Router context (e.g. `{ signOut }` for the header). */
    context = {},
  }: {
    path?: string;
    queryClient?: QueryClient;
    browser?: boolean;
    context?: Record<string, unknown>;
  } = {},
): Promise<RouterRender> {
  const rootRoute = createRootRoute({ component: Outlet });
  const here = createRoute({ getParentRoute: () => rootRoute, path, component: () => ui });
  const elsewhere = createRoute({
    getParentRoute: () => rootRoute,
    path: '$',
    component: () => <p>Elsewhere</p>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([here, elsewhere]),
    history: browser ? browserHistoryAt(path) : createMemoryHistory({ initialEntries: [path] }),
    context,
  });
  const navigate = vi.fn<NavigateHref>(historyNavigate(router.history));
  await act(() => router.load());
  const result = render(
    <QueryClientProvider client={queryClient}>
      <NavigateContext.Provider value={navigate}>
        <RouterProvider router={router} />
      </NavigateContext.Provider>
    </QueryClientProvider>,
  );
  await act(async () => {});
  const location = () => router.history.location.pathname + router.history.location.search;
  return { ...result, queryClient, router, navigate, location };
}
