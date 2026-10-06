import { createRouter } from '@tanstack/react-router';
import { routeTree } from '../routeTree.gen';
import type { RouterContext } from './router-context';

/** D65: scroll position is remembered per path, so School → Food → School lands on the same card. */
export function createAppRouter(context: RouterContext) {
  return createRouter({
    routeTree,
    context,
    scrollRestoration: true,
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
