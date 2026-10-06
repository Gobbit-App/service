import type { QueryClient } from '@tanstack/react-query';

/** What every route's loader and component can reach through the router. */
export type RouterContext = {
  queryClient: QueryClient;
  /** Ends the session and clears local data (D66). */
  signOut: () => Promise<void>;
};
