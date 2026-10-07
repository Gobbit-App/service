import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createIdbPersister } from './api/persist';
import { CACHE_MAX_AGE_MS, createAppQueryClient } from './api/query-client';
import { signOut, unauthorizedRedirect } from './api/session';
import { createAppRouter } from './app/router';
import { NavigateContext } from './ui/NavLink';
import './styles.css';

const persister = createIdbPersister();

/** D66: a 401 anywhere sends the user to sign-in with the current path as `next`. */
const queryClient = createAppQueryClient(() => {
  const target = unauthorizedRedirect(window.location);
  if (target) router.history.replace(target);
});

const router = createAppRouter({
  queryClient,
  signOut: () =>
    signOut({
      queryClient,
      removePersisted: async () => {
        await persister.removeClient();
      },
    }),
});

const navigate = (href: string) => router.history.push(href);

const root = document.getElementById('root');
if (!root) throw new Error('index.html is missing #root');

createRoot(root).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: CACHE_MAX_AGE_MS, buster: __APP_COMMIT__ }}
    >
      <NavigateContext.Provider value={navigate}>
        <RouterProvider router={router} />
      </NavigateContext.Provider>
    </PersistQueryClientProvider>
  </StrictMode>,
);
