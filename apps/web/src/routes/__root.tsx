import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import { useOfflineBanner } from '../api/offline';
import type { RouterContext } from '../app/router-context';
import { ServiceWorkerUpdate } from '../app/ServiceWorkerUpdate';
import { NavLink } from '../ui/NavLink';
import { EmptyState, OfflineBanner } from '../ui/StatusViews';

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: NotFound,
});

function RootLayout() {
  const offline = useOfflineBanner();
  return (
    <div className="app">
      <OfflineBanner visible={offline} />
      <Outlet />
      <ServiceWorkerUpdate />
    </div>
  );
}

function NotFound() {
  return (
    <main className="page">
      <EmptyState
        title="Page not found"
        action={
          <NavLink href="/" className="button">
            Go home
          </NavLink>
        }
      />
    </main>
  );
}
