import { createRouter } from '@tanstack/react-router';
import { isBrowsePath } from '../browse/browse-params';
import { routeTree } from '../routeTree.gen';
import type { RouterContext } from './router-context';

/**
 * D65: scroll position is remembered per path, so School → Food → School lands on the same card.
 * Browse positions itself from `i` (its snap container would otherwise be restored to wherever
 * the last Browse in this tab stopped, and on every settle replace), so it opts out.
 */
export function createAppRouter(context: RouterContext) {
  return createRouter({
    routeTree,
    context,
    scrollRestoration: ({ location }) => !isBrowsePath(location.pathname),
    getScrollRestorationKey: (location) => location.pathname,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
