import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createIdbPersister, revalidateRestored, shouldPersistQuery } from './api/persist';
import { CACHE_MAX_AGE_MS, createAppQueryClient } from './api/query-client';
import { signOut, unauthorizedRedirect } from './api/session';
import { historyNavigate } from './app/history-navigate';
import { createAppRouter } from './app/router';
import { NavigateContext } from './ui/NavLink';
import { installTooltipPress } from './ui/tooltip-press';
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
      // Loaded on demand: the drafts store is not part of the initial bundle.
      clearDrafts: async () => (await import('./editor/drafts-store')).clearDrafts(),
    }),
});

const navigate = historyNavigate(router.history);

// D212: long-press shows a control's tooltip on touch screens.
installTooltipPress();

const root = document.getElementById('root');
if (!root) throw new Error('index.html is missing #root');

createRoot(root).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: CACHE_MAX_AGE_MS,
        buster: __APP_COMMIT__,
        dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
      }}
      onSuccess={() => revalidateRestored(queryClient)}
    >
      <NavigateContext.Provider value={navigate}>
        <RouterProvider router={router} />
      </NavigateContext.Provider>
    </PersistQueryClientProvider>
  </StrictMode>,
);
